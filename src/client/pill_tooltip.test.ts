import { describe, it, expect } from 'vitest';

import { carriedPillActor, PillTooltip } from './pill_tooltip';
import { teamTextColor } from '../team_colors';

const BLUE = 1;

/** A tank as the tooltip sees it: a name (once its nick has arrived) and a team. */
function tank(name: string | undefined, team: number): any {
  return { name, team };
}

/** A pillbox in one of its four states. `owner` is the network ref wrapper, `{ $: tank }`. */
function pill(state: 'inTank' | 'carried' | 'placed', owner: any, team: number): any {
  return {
    inTank: state === 'inTank',
    carried: state === 'carried',
    owner: owner ? { $: owner } : null,
    team,
  };
}

describe('carriedPillActor', () => {
  it('names the tank carrying a pill', () => {
    expect(carriedPillActor(pill('inTank', tank('nurpy', BLUE), BLUE)))
      .toEqual({ name: 'nurpy', team: BLUE });
  });

  it('names the same tank once its builder is walking the pill to a build site', () => {
    // The builder handoff flips inTank -> carried and leaves `owner` pointing at the tank.
    expect(carriedPillActor(pill('carried', tank('nurpy', BLUE), BLUE)))
      .toEqual({ name: 'nurpy', team: BLUE });
  });

  it('says nothing about a pill that is on the map', () => {
    expect(carriedPillActor(pill('placed', tank('nurpy', BLUE), BLUE))).toBeNull();
    expect(carriedPillActor(null)).toBeNull();
  });

  it('names the side when the owner reference has been nulled', () => {
    expect(carriedPillActor(pill('inTank', null, BLUE))).toEqual({ name: 'Team Blue', team: BLUE });
  });

  it('names the side when the carrier is in play but its nick has not arrived', () => {
    expect(carriedPillActor(pill('inTank', tank(undefined, BLUE), BLUE)))
      .toEqual({ name: 'Team Blue', team: BLUE });
  });
});

describe('PillTooltip', () => {
  const NURPY = { name: 'nurpy', team: BLUE };

  /**
   * jsdom has no layout engine, so the box the tooltip measures itself with is stubbed. Every
   * placement below is arithmetic on that box and the viewport, which is exactly what the real
   * thing does — the numbers here are the ones a browser would produce.
   */
  function makeTooltip(width = 60, height = 17): PillTooltip {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: width });
    Object.defineProperty(el, 'offsetHeight', { value: height });
    document.body.appendChild(el);
    return new PillTooltip(el);
  }

  it('starts hidden', () => {
    expect(makeTooltip().element.hidden).toBe(true);
  });

  it('shows the name in the carrier team colour, and hides again', () => {
    const tooltip = makeTooltip();

    tooltip.show(100, 100, NURPY);
    expect(tooltip.element.hidden).toBe(false);
    expect(tooltip.element.textContent).toBe('nurpy');
    // Compared through a probe element: reading back `style.color` returns the CSSOM's own
    // spacing, not the string that was assigned.
    const probe = document.createElement('div');
    probe.style.color = teamTextColor(BLUE);
    expect(tooltip.element.style.color).toBe(probe.style.color);

    tooltip.hide();
    expect(tooltip.element.hidden).toBe(true);
  });

  it('sits down and to the right of the pointer', () => {
    const tooltip = makeTooltip();
    tooltip.show(100, 100, NURPY);
    expect(tooltip.element.style.left).toBe('114px');
    expect(tooltip.element.style.top).toBe('118px');
  });

  it('flips to the left of the pointer at the right edge', () => {
    const tooltip = makeTooltip(60);
    const x = window.innerWidth - 10;
    tooltip.show(x, 100, NURPY);
    expect(tooltip.element.style.left).toBe(`${x - 60 - 6}px`);
  });

  it('flips above the pointer at the bottom edge — where the pill panel lives', () => {
    const tooltip = makeTooltip(60, 17);
    const y = window.innerHeight - 5;
    tooltip.show(100, y, NURPY);
    expect(tooltip.element.style.top).toBe(`${y - 17 - 6}px`);
  });

  it('never places itself off the top or left of the screen', () => {
    const tooltip = makeTooltip(2000, 2000);
    tooltip.show(20, 20, NURPY);
    expect(tooltip.element.style.left).toBe('0px');
    expect(tooltip.element.style.top).toBe('0px');
  });
});
