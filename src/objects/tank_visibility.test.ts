import { describe, it, expect } from 'vitest';

import { Tank } from './tank';

/**
 * A bare object on Tank's prototype: enough to exercise isAlly/isHiddenFrom, which read only
 * `team` and `hidden`, without standing up a world to run the constructor against.
 */
const tankLike = (team: number | null, hidden = false): Tank =>
  Object.assign(Object.create(Tank.prototype), { team, hidden });

describe('Tank.isHiddenFrom — forest cover hides you from the enemy, not from your own side', () => {
  it('conceals an enemy under cover', () => {
    const enemy = tankLike(1, true);
    expect(enemy.isHiddenFrom(tankLike(0))).toBe(true);
  });

  it('does NOT conceal a team mate under cover', () => {
    const mate = tankLike(0, true);
    expect(mate.isHiddenFrom(tankLike(0))).toBe(false);
  });

  it('never conceals a tank from itself', () => {
    const me = tankLike(0, true);
    expect(me.isHiddenFrom(me)).toBe(false);
  });

  it('conceals nobody who is not actually under cover', () => {
    expect(tankLike(1).isHiddenFrom(tankLike(0))).toBe(false);
    expect(tankLike(0).isHiddenFrom(tankLike(0))).toBe(false);
  });

  it('conceals from a viewer who has no tank of their own', () => {
    // Before joining, or between death and respawn: on nobody's side, so sees no hidden tanks.
    const enemy = tankLike(1, true);
    expect(enemy.isHiddenFrom(null)).toBe(true);
    expect(enemy.isHiddenFrom(undefined)).toBe(true);
  });

  it('treats a teamless viewer as nobody\'s ally', () => {
    // team 255 is the neutral marker; isAlly refuses to match it against anyone but itself.
    const hiddenNeutral = tankLike(255, true);
    expect(hiddenNeutral.isHiddenFrom(tankLike(255))).toBe(true);
    expect(hiddenNeutral.isHiddenFrom(hiddenNeutral)).toBe(false);
  });

  it('agrees with isAlly, which is the rule it defers to', () => {
    for (const [viewerTeam, targetTeam, concealed] of [
      [0, 0, false], [0, 1, true], [3, 3, false], [3, 5, true],
    ] as [number, number, boolean][]) {
      expect(tankLike(targetTeam, true).isHiddenFrom(tankLike(viewerTeam))).toBe(concealed);
    }
  });
});
