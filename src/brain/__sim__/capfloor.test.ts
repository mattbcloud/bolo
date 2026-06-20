import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';
import { checkBarriers } from '../combat';

// Capture-floor diagnostic: ~80% of trials capture nothing. Is the bottleneck
// (a) never ENGAGING a pill (reachability/targeting), or (b) engaging but never
// CLOSING the kill (combat/finish)? Track, per trial, over enemy/neutral pills:
//   - how many exist, how many within 20 tiles of the tank start
//   - how many ever took ANY damage (min armour < start armour)
//   - the lowest armour any pill reached (how close to a 0-armour capture)
//   - captures (pills that hit armour 0 / got owned by the brain tank)
(globalThis as any).__BRAIN_DBG__ = false;

describe('capture-floor diagnostic', () => {
  it('classifies why trials fail to capture', () => {
    const trials = 30, ticks = 5000, baseSeed = 1000;
    let engagedTrials = 0, damagedTrials = 0, nearKillTrials = 0, capturedTrials = 0;
    let totalPillsNear = 0, totalEngaged = 0;
    const minArmours: number[] = [];

    for (let k = 0; k < trials; k++) {
      const world = bootHeadlessWorld(baseSeed + k * 7919);
      const a4: any = enableBrain(world);
      placeTank(world, 115, 109, false);
      const t: any = world.player;

      const pills: any[] = Array.from(world.map.pills ?? []);
      // start armour per pill + min armour tracker
      const startArm = new Map<any, number>();
      const minArm = new Map<any, number>();
      let near = 0;
      for (const p of pills) {
        startArm.set(p, p.armour);
        minArm.set(p, p.armour);
        const px = (p.x ?? (p.cell?.x)) ?? 0, py = (p.y ?? (p.cell?.y)) ?? 0;
        const dTiles = Math.max(Math.abs((px >> 8) - 115), Math.abs((py >> 8) - 109));
        if (dTiles <= 20) near++;
      }
      totalPillsNear += near;

      let holdTicks = 0, lowInRangeTicks = 0, lowCoveredTicks = 0, wallsBuilt = 0;
      let buildDispatch = 0, forestDispatch = 0, builderOutTicks = 0, maxTrees = 0;
      const orderHist: Record<number, number> = {};
      const wallTiles = new Set<number>();
      const treesCheat = process.env.TREES_CHEAT ? Number(process.env.TREES_CHEAT) : 0;
      for (let i = 0; i < ticks; i++) {
        if (treesCheat && t.trees < treesCheat) t.trees = treesCheat;   // probe: infinite cover materials
        world.tick();
        for (const p of pills) {
          if (p.armour < (minArm.get(p) ?? 99)) minArm.set(p, p.armour);
        }
        if (a4.coverFinishHold) holdTicks++;
        if (t.trees > maxTrees) maxTrees = t.trees;
        const pba = a4.pendingBuilderAction;
        if (pba?.action === 'building') buildDispatch++;
        if (pba?.action === 'forest') forestDispatch++;
        const bldr = (t as any).builder;
        if (bldr && bldr.$ && bldr.$.order !== undefined && bldr.$.order !== 0) {
          builderOutTicks++;
          orderHist[bldr.$.order] = (orderHist[bldr.$.order] ?? 0) + 1;
        }
        // Is the brain's target pill low & in range, and is it covered?
        const tp = a4.pillToGetTarget;
        if (tp && tp.armour > 0 && tp.armour <= 8) {
          const d = Math.max(Math.abs(tp.tileX - (t.x >> 8)), Math.abs(tp.tileY - (t.y >> 8)));
          if (d <= 8) {
            lowInRangeTicks++;
            const pcx = ((tp.tileX & 0xFF) << 8) + 128, pcy = ((tp.tileY & 0xFF) << 8) + 128;
            if (checkBarriers(a4, t.x, t.y, pcx, pcy) > 0) lowCoveredTicks++;
          }
        }
        // Count built wall tiles (terrain 0) that weren't there at start near pills
        for (const p of pills) {
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const tx = (p.tileX + dx) & 0xFF, ty = (p.tileY + dy) & 0xFF;
            const key = (ty << 8) | tx;
            if ((a4.worldMap[key] & 0x0F) === 0 && !wallTiles.has(key)) { wallTiles.add(key); wallsBuilt++; }
          }
        }
      }
      if (k < 6) console.log(`[capfloor seed${k}] holdTicks=${holdTicks} lowInRange=${lowInRangeTicks} lowCovered=${lowCoveredTicks} wallTilesNearPills=${wallsBuilt} buildDispatch=${buildDispatch} forestDispatch=${forestDispatch} builderOut=${builderOutTicks} maxTrees=${maxTrees} orderHist=${JSON.stringify(orderHist)}`);

      let trialEngaged = 0, trialDamaged = false, trialNearKill = false, trialCaptured = false;
      let trialMin = 99;
      for (const p of pills) {
        const s = startArm.get(p) ?? 0;
        const m = minArm.get(p) ?? s;
        if (m < trialMin) trialMin = m;
        if (m < s) { trialDamaged = true; trialEngaged++; }
        if (m <= 3 && s > 3) trialNearKill = true;
        // captured: pill now owned by the brain tank (inTank or owner is player)
        if (p.armour === 0 || p.inTank) trialCaptured = true;
      }
      totalEngaged += trialEngaged;
      if (trialEngaged > 0) engagedTrials++;
      if (trialDamaged) damagedTrials++;
      if (trialNearKill) nearKillTrials++;
      if (trialCaptured) capturedTrials++;
      minArmours.push(trialMin);
    }

    console.log(`[capfloor] trials=${trials} pillsNear(<=20tx)=${(totalPillsNear/trials).toFixed(1)}/trial ` +
      `engagedTrials=${engagedTrials} damagedTrials=${damagedTrials} nearKill(<=3)=${nearKillTrials} captured=${capturedTrials}`);
    console.log(`[capfloor] perTrial lowestPillArmour reached: ${minArmours.join(',')}`);
  });
});
