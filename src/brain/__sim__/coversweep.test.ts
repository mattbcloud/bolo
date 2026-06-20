import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

const TILE = 256;
/** engine direction (0-255) from (tx,ty) toward (ax,ay): radians=(256-dir)*2pi/256 */
function dirToward(tx: number, ty: number, ax: number, ay: number): number {
  const rad = Math.atan2(ay - ty, ax - tx);
  let dir = Math.round(256 - (rad * 256) / (2 * Math.PI));
  return ((dir % 256) + 256) % 256;
}

/** One stationary engagement. Returns pill dmg dealt, tank dmg taken (or 'DIED'), wall survival. */
function engage(opts: {
  wallTiles: [number, number][];     // tiles to wall, relative to pill
  tankDX: number; tankDY: number;    // tank tile offset from pill
  aimDX: number; aimDY: number;      // aim point offset (world units) from pill center
  ticks?: number;
}): { dealt: number; taken: number | 'DIED'; wallsAlive: number; shots: number } {
  const world = bootHeadlessWorld();
  const pills = world.map.pills ?? [];
  const pill = pills.find((p: any) => p.armour > 0 && p.cell);
  const px = pill.cell.x, py = pill.cell.y;

  // Clear a 18x18 grass arena around the pill so only our walls block.
  for (let dx = -10; dx <= 4; dx++)
    for (let dy = -7; dy <= 7; dy++) {
      const c = world.map.cellAtTile(px + dx, py + dy);
      if (c && !c.pill && !c.base) c.setType('.');
    }
  // Build the cover wall(s).
  for (const [wx, wy] of opts.wallTiles) world.map.cellAtTile(px + wx, py + wy).setType('|');

  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(px + opts.tankDX);
  t.y = tileToBWorld(py + opts.tankDY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 9999; t.armour = 40; t.reload = 0;       // unlimited ammo: measure rate, not stock

  const aimX = pill.x + opts.aimDX, aimY = pill.y + opts.aimDY;
  t.direction = dirToward(t.x, t.y, aimX, aimY);

  const pill0 = pill.armour, arm0 = t.armour;
  let shots = 0, prevShells = t.shells;
  const ticks = opts.ticks ?? 600;
  for (let i = 0; i < ticks; i++) {
    // Keep hull locked on the aim direction; fire; never move.
    t.direction = dirToward(t.x, t.y, aimX, aimY);
    t.shooting = true; t.accelerating = false; t.braking = true;
    t.turningClockwise = false; t.turningCounterClockwise = false;
    world.tick();
    if (t.shells < prevShells) { shots++; prevShells = t.shells; }
    if (t.armour === 255) break;
  }
  let wallsAlive = 0;
  for (const [wx, wy] of opts.wallTiles)
    if (world.map.cellAtTile(px + wx, py + wy).isType('|')) wallsAlive++;
  return {
    dealt: pill0 - pill.armour,
    taken: t.armour === 255 ? 'DIED' : arm0 - t.armour,
    wallsAlive, shots,
  };
}

describe('cover geometry sweep', () => {
  it('sweeps tank offset x aim offset for a wall west of the pill', () => {
    // Wall one tile west of pill (between pill and a westward tank).
    const wall: [number, number][] = [[-1, 0]];
    // eslint-disable-next-line no-console
    console.log('[sweep] wall at pill+(-1,0); tank west of pill');
    for (const tankDY of [-2, -1, 0, 1, 2]) {
      for (const aimDY of [-192, -128, -96, -64, 0, 64, 96, 128, 192]) {
        const r = engage({ wallTiles: wall, tankDX: -6, tankDY, aimDX: 0, aimDY });
        // eslint-disable-next-line no-console
        console.log(`  tankDY=${tankDY} aimDY=${String(aimDY).padStart(4)} ` +
          `dealt=${String(r.dealt).padStart(2)} taken=${String(r.taken).padStart(4)} ` +
          `wallsAlive=${r.wallsAlive} shots=${r.shots}`);
      }
    }
  });

  it('baseline: no wall, tank center-aim at 6 tiles', () => {
    const r = engage({ wallTiles: [], tankDX: -6, tankDY: 0, aimDX: 0, aimDY: 0 });
    // eslint-disable-next-line no-console
    console.log(`[sweep] NO-WALL baseline: dealt=${r.dealt} taken=${r.taken} shots=${r.shots}`);
  });
});
