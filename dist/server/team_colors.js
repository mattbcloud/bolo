/**
 * This module contains just a list of team colours and descriptive names.
 */
const TEAM_COLORS = [
    { r: 255, g: 0, b: 0, name: 'red' }, // Team 0
    { r: 0, g: 0, b: 255, name: 'blue' }, // Team 1
    { r: 255, g: 255, b: 0, name: 'yellow' }, // Team 2
    { r: 0, g: 255, b: 0, name: 'green' }, // Team 3
    { r: 255, g: 165, b: 0, name: 'orange' }, // Team 4
    { r: 128, g: 0, b: 128, name: 'purple' }, // Team 5
];
// ── Team colours as readable text ────────────────────────────────────────────
// The raw team colours above are picked to be told apart as filled shapes — tank
// sprites, HUD dots, overview markers. Set as *text on black* they need adjusting
// twice over, and `teamTextColor()` is the one place that happens:
//
//   Legibility — blue (#0000ff) sits at 2.4:1 contrast and purple (#800080) at
//   2.2:1, well under the 4.5:1 a small glyph needs.
//
//   Weight and depth — a colour with a channel at zero is fully saturated in that
//   direction, so it carries little light (pure red emits 21% of white's) and reads
//   thinner than the white prose beside it; at a spectral extreme it also appears to
//   sit slightly forward of the baseline. Every colour is nudged off its zero.
//
// Hue is preserved exactly throughout, so the crawl still names the same six sides
// the dots and markers do — but the text values are NOT identical to the raw ones.
// Nothing else in the codebase reads these adjusted values; every other consumer
// uses TEAM_COLORS directly.
/** Undo the sRGB transfer function for one 0-255 channel. */
function linearize(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** WCAG relative luminance. */
function relativeLuminance(r, g, b) {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
/** WCAG contrast ratio against pure black, whose luminance is 0. */
export function contrastOnBlack(r, g, b) {
    return (relativeLuminance(r, g, b) + 0.05) / 0.05;
}
/** Returns [hue 0-360, saturation 0-1, lightness 0-1]. */
export function rgbToHsl(r, g, b) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0)
        return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rr)
        h = ((gg - bb) / d) % 6;
    else if (max === gg)
        h = (bb - rr) / d + 2;
    else
        h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0)
        h += 360;
    return [h, s, l];
}
/** Inverse of the above; returns rounded 0-255 channels. */
export function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60)
        [rr, gg, bb] = [c, x, 0];
    else if (h < 120)
        [rr, gg, bb] = [x, c, 0];
    else if (h < 180)
        [rr, gg, bb] = [0, c, x];
    else if (h < 240)
        [rr, gg, bb] = [0, x, c];
    else if (h < 300)
        [rr, gg, bb] = [x, 0, c];
    else
        [rr, gg, bb] = [c, 0, x];
    return [
        Math.round((rr + m) * 255),
        Math.round((gg + m) * 255),
        Math.round((bb + m) * 255),
    ];
}
/** The colour neutral / unknown-team text is painted in: the HUD's chrome colour. */
export const NEUTRAL_TEXT_COLOR = '#c0c0f0';
/** Minimum contrast ratio a team colour must reach before it is used as text on black. */
export const MIN_TEXT_CONTRAST = 4.5;
/** Lightness is never pushed past this, to stop a lifted colour washing out to white. */
const MAX_LIGHTNESS = 0.85;
/**
 * The smallest value any channel may hold once a colour is used as text on black.
 *
 * A channel sitting at zero means the colour is fully saturated in that direction, and on a
 * black field that costs twice over:
 *
 *  - **Weight.** The glyph carries only the light of its live channels — pure red emits 21% of
 *    white's luminance — so its strokes read as thinner and smaller than the white prose beside
 *    them, as though the name were set in a different, smaller font.
 *  - **Depth.** At a spectral extreme the eye's lens focuses the hue at a slightly different
 *    distance from the white around it (chromostereopsis), so saturated red appears to float
 *    forward off the baseline, reading a little like superscript.
 *
 * Both ease off as soon as the other channels carry some light. Lifting the floor is done by
 * blending toward white, which scales every channel difference by the same factor and so
 * preserves hue exactly — red stays hue 0, purple stays hue 300.
 */
export const MIN_CHANNEL = 51;
const textColorCache = new Map();
/**
 * The CSS colour to paint this team's name in, on the newswire's black field.
 *
 * Two passes, both hue-preserving:
 *
 *  1. If the raw colour cannot be read on black, raise lightness in 1% steps until it clears
 *     `MIN_TEXT_CONTRAST`. Colours that already clear it are left alone.
 *  2. Lift any channel still below `MIN_CHANNEL` by blending toward white, so no team colour
 *     is left fully saturated in a direction — see MIN_CHANNEL for why that matters on black.
 *
 * Pass 2 runs after pass 1 deliberately: it works on the already-legible colour, so it needs
 * only a nudge and never has to wash a hue out to reach the floor. It can only raise contrast,
 * never lower it. Neutral, unowned and out-of-range teams get the HUD chrome colour.
 */
export function teamTextColor(team) {
    if (team == null || team < 0 || team >= TEAM_COLORS.length)
        return NEUTRAL_TEXT_COLOR;
    const cached = textColorCache.get(team);
    if (cached !== undefined)
        return cached;
    const base = TEAM_COLORS[team];
    let [r, g, b] = [base.r, base.g, base.b];
    if (contrastOnBlack(r, g, b) < MIN_TEXT_CONTRAST) {
        const [h, s, l0] = rgbToHsl(r, g, b);
        let l = l0;
        while (contrastOnBlack(r, g, b) < MIN_TEXT_CONTRAST && l < MAX_LIGHTNESS) {
            l = Math.min(MAX_LIGHTNESS, l + 0.01);
            [r, g, b] = hslToRgb(h, s, l);
        }
    }
    // Blending toward white scales every channel gap by the same factor, so the hue is untouched
    // while the dark channels come up off zero. The factor is solved for in one step rather than
    // iterated: repeated blending would round each channel on every pass, and the accumulated
    // error is enough to drag a hue off true (orange drifted two degrees when this was a loop).
    const darkest = Math.min(r, g, b);
    if (darkest < MIN_CHANNEL) {
        const k = (MIN_CHANNEL - darkest) / (255 - darkest);
        r = Math.round(r + (255 - r) * k);
        g = Math.round(g + (255 - g) * k);
        b = Math.round(b + (255 - b) * k);
    }
    const result = `rgb(${r},${g},${b})`;
    textColorCache.set(team, result);
    return result;
}
export default TEAM_COLORS;
//# sourceMappingURL=team_colors.js.map