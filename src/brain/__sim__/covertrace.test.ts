import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

const GOAL_NAMES: Record<number, string> = {
  0:'PlacePill',1:'Explore',2:'FixPill',3:'GetBase',4:'GetMan',5:'GetPill',
  6:'KillBase',7:'KillMan',8:'KillTank',9:'Refuel',10:'TourBases',12:'NoGoal',
};

describe('single pill engagement trace', () => {
  it('traces goalGetPill + cover behaviour tick by tick', () => {
    const world = bootHeadlessWorld(1000);
    const a4: any = enableBrain(world);
    const isOpen = (tx: number, ty: number) => {
      const tr = (world.map.cellAtTile(tx, ty)?.type?.ascii) ?? '?';
      return tr === '.' || tr === ' ' || tr === '=' || tr === '%' || tr === ':'; // grass/road/rubble
    };
    // Pick a pill whose surroundings are mostly open (not forest-enclosed/water).
    let pill: any = null, openScore = -1;
    for (const p of world.map.pills ?? []) {
      const c = p.cell; if (!c || p.armour <= 0) continue;
      let open = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (isOpen(c.x + dx, c.y + dy)) open++;
      if (open > openScore) { openScore = open; pill = p; }
    }
    const px = pill.cell.x, py = pill.cell.y;
    // eslint-disable-next-line no-console
    console.log(`[trace] chosen pill (${px},${py}) openNeighbours(5x5)=${openScore}/25`);
    // place tank ~6.3tx ENE on open terrain
    placeTank(world, px + 6, py + 2, false);
    const t = world.player;
    t.trees = 10;

    const coverTileWall = () => {
      // pill neighbour toward tank (tank is +x,+y of pill → SE neighbour)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const c = world.map.cellAtTile(px + dx, py + dy);
        if (c?.isType('|')) return `(${px + dx},${py + dy})`;
      }
      return 'none';
    };

    for (let i = 0; i < 1500; i++) {
      world.tick();
      if (i % 100 === 0) {
        const best = a4.goals.reduce((b: any, g: any) => g.cost < b.cost ? g : b, { goalIndex: 12, cost: 0xFFFF });
        const dpx = Math.hypot(t.x - pill.x, t.y - pill.y) / 256;
        // cover tile = pill neighbour toward tank
        const dirPT = Math.atan2(-(t.y - pill.y), t.x - pill.x);
        let dd = Math.round(256 - dirPT * 256 / (2 * Math.PI)) & 0xFF;
        const OFF = [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]][Math.round((dd)/32)&7];
        const cnx = px + OFF[0], cny = py + OFF[1];
        const cterr = a4.worldMap[((cny&0xFF)<<8)|(cnx&0xFF)] & 0x0F;
        // center barriers (manual DDA over worldMap)
        let cb = 0; const steps = 8;
        for (let k = 1; k < steps; k++) {
          const sx = (t.x + Math.round((pill.x - t.x) * k / steps)) & 0xFFFF;
          const sy = (t.y + Math.round((pill.y - t.y) * k / steps)) & 0xFFFF;
          const tr = a4.worldMap[(((sy>>8)&0xFF)<<8)|((sx>>8)&0xFF)] & 0x0F;
          if (tr===0||tr===5||tr===8||tr===9||tr===12) cb++;
        }
        // eslint-disable-next-line no-console
        console.log(`t=${String(i).padStart(4)} goal=${(GOAL_NAMES[best.goalIndex]||'?').padEnd(7)} ` +
          `d=${dpx.toFixed(1)} trees=${t.trees} bIn=${t.builder?.$?.order===t.builder?.$?.states?.inTank?1:0} ` +
          `atk=${a4.newGetPillAttackMode} covTile=(${cnx},${cny})t${cterr} centerBar=${cb} ` +
          `shellCnt=${t.firingRange*2} wall=${coverTileWall()} pArm=${pill.armour} ` +
          `tArm=${t.armour} s=0x${(a4.steeringWord>>>0).toString(16)} f=0x${(a4.firingWord>>>0).toString(16)}`);
      }
      if (pill.armour === 0 && pill.team === t.team) { console.log(`CAPTURED at t=${i}`); break; }
    }
  });
});
