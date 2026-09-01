import { describe, it, expect } from 'vitest';
import { A4State } from '../a4_state';
import { refuelGoalCost } from '../goal_selectors';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * DON'T CAMP FOR A TOP-OFF UNDER A PILLBOX'S GUNS.
 *
 * refuelGoalCost holds Refuel at cost 0 while the tank is parked ON a stocked base, so a pill can't
 * pull it off at half armour — deliberate, and it only lifts once BOTH armour and shells reach 40.
 *
 * Under fire it never lifts. A base regenerates the tank at roughly +5 armour per 46 ticks and a
 * live pillbox strips it back faster, so armour < 40 stays true forever and cost 0 stays pinned.
 * Measured on a base 3 tiles from a hostile pill: the tank held at armour 0 for 2400+ ticks while
 * the base drained 87 -> 27 stock, with Refuel winning 60% of all ticks — alive, stuck, and never
 * fighting again. The hold is for topping off somewhere safe; it is not a reason to stand still
 * and be shot.
 *
 * A covered base is NOT skipped — chooseRefuelBase still keeps it as the last-resort `fallback`,
 * and the armour<16 emergency below can still send a desperate tank there. Refuelling under guns
 * is worth it to survive. Camping for a full top-off is not.
 */
describe('refuel hold: not while the base is under a hostile pillbox', () => {
  const TX = 129, TY = 104;
  const base: any = {
    index: 0, isAlly: true, isEnemy: false,
    tileX: TX, tileY: TY,
    x: (TX << 8) + 128, y: (TY << 8) + 128,
    armor: 90, distToTank: 0,
  };
  // 3 tiles south of the base — well inside the 1919-unit (7.5 tile) pillbox reach.
  const hostilePill: any = {
    active: true, armour: 15, attackable: true,
    x: (TX << 8) + 128, y: ((TY + 3) << 8) + 128,
  };

  function setup(pills: any[]) {
    const a4 = new A4State();
    a4.refuelBaseTarget = base;
    a4.pills = pills;
    a4.tankTileX = TX;
    a4.tankTileY = TY;
    // Parked on the base, hurt but not in the <16 emergency band, so the ONLY thing that can
    // return 0 here is the top-off hold itself.
    const state: any = { tank: { armor: 20, shells: 20, ammo: 4, speed: 0, resourceCount: 0 } };
    return { a4, state };
  }

  it('holds at cost 0 on a SAFE base — the top-off behaviour is unchanged', () => {
    const { a4, state } = setup([]);
    expect(refuelGoalCost(a4, state)).toBe(0);
  });

  it('does NOT hold on a base a live hostile pill covers', () => {
    const { a4, state } = setup([hostilePill]);
    // Falls through to the normal cost (armor + shells*8 + 40), so other goals can outbid it and
    // the tank is free to leave instead of being ground down in place.
    expect(refuelGoalCost(a4, state)).toBe(20 + 20 * 8 + 40);
  });

  it('a DEAD pill next to the base is not a threat, so the hold still applies', () => {
    const { a4, state } = setup([{ ...hostilePill, armour: 0 }]);
    expect(refuelGoalCost(a4, state)).toBe(0);
  });

  it('an ALLY pill next to the base is not a threat either', () => {
    const { a4, state } = setup([{ ...hostilePill, attackable: false }]);
    expect(refuelGoalCost(a4, state)).toBe(0);
  });
});
