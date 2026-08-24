/**
 * This module contains just a list of team colours and descriptive names.
 */
export interface TeamColor {
    r: number;
    g: number;
    b: number;
    name: string;
}
declare const TEAM_COLORS: TeamColor[];
/** WCAG contrast ratio against pure black, whose luminance is 0. */
export declare function contrastOnBlack(r: number, g: number, b: number): number;
/** Returns [hue 0-360, saturation 0-1, lightness 0-1]. */
export declare function rgbToHsl(r: number, g: number, b: number): [number, number, number];
/** Inverse of the above; returns rounded 0-255 channels. */
export declare function hslToRgb(h: number, s: number, l: number): [number, number, number];
/** The colour neutral / unknown-team text is painted in: the HUD's chrome colour. */
export declare const NEUTRAL_TEXT_COLOR = "#c0c0f0";
/** Minimum contrast ratio a team colour must reach before it is used as text on black. */
export declare const MIN_TEXT_CONTRAST = 4.5;
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
export declare const MIN_CHANNEL = 51;
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
export declare function teamTextColor(team: number | null | undefined): string;
export default TEAM_COLORS;
//# sourceMappingURL=team_colors.d.ts.map