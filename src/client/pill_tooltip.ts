/**
 * Pillbox tooltip
 *
 * The `#pillStatus` panel says that a pillbox is being carried, but not by whom. Hovering a
 * carried indicator pops up the carrier's name in their team colour.
 *
 * The name is already on the client and needs no new plumbing: a pillbox keeps its identity while
 * carried — pickup does `ref('owner', tank)` (`objects/world_pillbox.ts`) and `owner` is
 * serialized unconditionally as an object reference, so `pill.owner.$` is the shared Tank — and
 * `tank.name` arrives over the `nick` side channel (`client/world/client.ts`).
 *
 * The panel container and the listeners live in `renderer/base.ts` alongside the rest of the HUD;
 * this module owns the popup element and the one piece of vocabulary the popup needs.
 */

import { actorOf, NewswireActor } from '../newswire';
import { teamTextColor } from '../team_colors';

/** Where the tooltip sits relative to the pointer, in pixels: down and to the right of it. */
const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 18;

/** Clearance kept from the pointer when the tooltip has to flip to its other side. */
const FLIP_GAP = 6;

/**
 * Who is carrying this pillbox, or null if nobody is.
 *
 * The carried test is `inTank || carried` — the same pair of flags the HUD reads to draw the
 * `carried` sprite. Both states are one player's: `inTank` is a pill riding in a tank, `carried`
 * is one its builder is walking to a build site, and the builder handoff
 * (`objects/builder.ts`) leaves `owner` pointing at the tank either way.
 *
 * `actorOf` supplies the fallbacks rather than reading `.name` here: a tank that has spawned but
 * whose nick has not yet arrived, and an owner reference that has been nulled, both name the side
 * instead of printing `undefined`. Neither should occur for a *carried* pill — `Tank.destroy()`
 * drops its pillboxes, so the disconnect path that nulls `owner` only ever sees placed ones — but
 * a pill dropped in the same frame as the hover takes the same route.
 */
export function carriedPillActor(pill: any): NewswireActor | null {
  if (!pill || !(pill.inTank || pill.carried)) return null;
  return actorOf(pill.owner?.$ ?? { team: pill.team });
}

/**
 * The popup itself: one element, following the pointer while a carried indicator is hovered.
 *
 * It is positioned from script rather than placed in CSS because it tracks the cursor. `#hud` is
 * a fixed box covering the viewport, so an absolutely positioned child of it shares the viewport
 * coordinate space that `clientX`/`clientY` report, and the pointer position needs no conversion.
 */
export class PillTooltip {
  element: HTMLDivElement;

  constructor(element: HTMLDivElement) {
    this.element = element;
    this.element.hidden = true;
  }

  /** Name `actor` beside the pointer at viewport coordinates (x, y). */
  show(x: number, y: number, actor: NewswireActor): void {
    const el = this.element;
    if (el.textContent !== actor.name) el.textContent = actor.name;
    el.style.color = teamTextColor(actor.team);
    el.hidden = false;

    // Measured after unhiding: a hidden element has no box.
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    // Down and to the right of the pointer, where a tooltip belongs. An edge flips it to the
    // pointer's other side rather than clamping it flat against that edge, which would slide it
    // under the cursor — and the pill panel sits at the bottom of the screen by default, so the
    // vertical flip is the common case, not the exception.
    let left = x + CURSOR_OFFSET_X;
    if (left + width > window.innerWidth) left = x - width - FLIP_GAP;
    let top = y + CURSOR_OFFSET_Y;
    if (top + height > window.innerHeight) top = y - height - FLIP_GAP;

    el.style.left = `${Math.round(Math.max(0, left))}px`;
    el.style.top = `${Math.round(Math.max(0, top))}px`;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
