import { describe, it, expect } from 'vitest';

import {
  formatNewswire, teamActor, actorOf, pillboxActor, newswireMessage, updateStandings, channelOf,
  placeName, positionShapeCount, NEWSWIRE_HEADER, NEWSWIRE_CHANNEL_LABELS, NEWSWIRE_POSITION_MARGIN, NewswireKind,
} from './newswire';
import TEAM_COLORS, { teamTextColor, contrastOnBlack, rgbToHsl, NEUTRAL_TEXT_COLOR, MIN_TEXT_CONTRAST, MIN_CHANNEL } from './team_colors';

const RED = { name: 'Redshirt', team: 0 };
/** A team rising to second past the team directly below it — the everyday position change. */
const SWAP = { riser: 2, faller: 3 };
const BLUE = { name: 'Bravo', team: 1 };

/** Flatten segments back to the line a reader sees. */
const text = (segments: { t: string }[]) => segments.map((s) => s.t).join('');

describe('formatNewswire', () => {
  it('renders every kind', () => {
    expect(text(formatNewswire('base_capture', BLUE))).toBe('Bravo captured a Neutral Base');
    expect(text(formatNewswire('base_steal', BLUE, RED))).toBe('Bravo just stole base from Redshirt');
    expect(text(formatNewswire('pill_capture', BLUE))).toBe('Bravo captured a Neutral Pillbox');
    expect(text(formatNewswire('pill_steal', BLUE, RED))).toBe('Bravo just stole pillbox from Redshirt');
    expect(text(formatNewswire('builder_lost', BLUE))).toBe('Bravo just lost their builder');
    expect(text(formatNewswire('tank_kill', BLUE, RED))).toBe('Bravo destroyed Redshirt');
    expect(text(formatNewswire('tank_mined', BLUE))).toBe('Bravo was blown up by a mine');
    expect(text(formatNewswire('tank_sunk', BLUE))).toBe('Bravo sank in deep sea');
    expect(text(formatNewswire('player_join', BLUE))).toBe('Bravo has joined the game');
    expect(text(formatNewswire('player_quit', BLUE))).toBe('Bravo has quit game');
    expect(text(formatNewswire('lead_change', teamActor(5), teamActor(4))))
      .toBe('Team Purple takes the lead from Team Orange');
    expect(text(formatNewswire('position_change', teamActor(5), teamActor(3), SWAP)))
      .toBe('Team Purple up to second, Team Green down to third');
    expect(text(formatNewswire('pill_kill', RED, pillboxActor(1))))
      .toBe('Redshirt was destroyed by a Team Blue Pillbox');
    expect(text(formatNewswire('pill_kill', RED, pillboxActor(255))))
      .toBe('Redshirt was destroyed by a Neutral Pillbox');
  });

  it('attributes a pillbox kill to the side that holds it, not to a player', () => {
    // A pill picks targets from this.team alone (world_pillbox.ts:245-247), so the side is the
    // truthful shooter. The engine's shell.attribution credits the owner tank, which is a
    // scoring decision from 2010 and is deliberately NOT what the wire reports.
    expect(formatNewswire('pill_kill', RED, pillboxActor(1))).toEqual([
      { t: 'Redshirt', team: 0 },
      { t: ' was destroyed by a ', team: null },
      { t: 'Team Blue', team: 1 },
      { t: ' Pillbox', team: null },
    ]);
  });

  it('gives both pillbox deaths the same shape, differing only in the qualifier', () => {
    const owned = text(formatNewswire('pill_kill', RED, pillboxActor(1)));
    const neutral = text(formatNewswire('pill_kill', RED, pillboxActor(255)));
    expect(owned.startsWith('Redshirt was destroyed by a ')).toBe(true);
    expect(neutral.startsWith('Redshirt was destroyed by a ')).toBe(true);
    expect(owned.endsWith('Pillbox')).toBe(true);
    expect(neutral.endsWith('Pillbox')).toBe(true);
  });

  it('leads with the player when the pill is neutral, since there is no side to name', () => {
    // Matches the other killer-less deaths: "X was blown up by a mine", "X sank in deep sea".
    expect(formatNewswire('pill_kill', RED, pillboxActor(null))).toEqual([
      { t: 'Redshirt', team: 0 },
      { t: ' was destroyed by a Neutral Pillbox', team: null },
    ]);
    expect(pillboxActor(255)).toBe(null);
    expect(pillboxActor(null)).toBe(null);
  });

  it('reads the same for an owned pill whose owner has since disconnected', () => {
    // world_mixin.ts:96-97 nulls the owner ref but keeps the team, so the line must not change.
    expect(text(formatNewswire('pill_kill', RED, pillboxActor(1))))
      .toBe('Redshirt was destroyed by a Team Blue Pillbox');
  });

  it('puts the team on names and null on prose', () => {
    expect(formatNewswire('base_steal', BLUE, RED)).toEqual([
      { t: 'Bravo', team: 1 },
      { t: ' just stole base from ', team: null },
      { t: 'Redshirt', team: 0 },
    ]);
  });

  it('never colours the prose of a one-party line', () => {
    for (const kind of ['base_capture', 'pill_capture', 'builder_lost', 'tank_mined', 'tank_sunk',
                        'player_join', 'player_quit'] as NewswireKind[]) {
      // lead_change is excluded: both of its parties are named sides, not prose.
      const segments = formatNewswire(kind, BLUE);
      expect(segments[0]).toEqual({ t: 'Bravo', team: 1 });
      expect(segments.slice(1).every((s) => s.team === null)).toBe(true);
    }
  });

  it('reads a killer-less shell death as "was destroyed", not "X destroyed X"', () => {
    expect(text(formatNewswire('tank_kill', BLUE))).toBe('Bravo was destroyed');
    expect(text(formatNewswire('tank_kill', BLUE, null))).toBe('Bravo was destroyed');
  });

  it('falls back to the team name, still team-coloured, when the owner is unrecoverable', () => {
    const segments = formatNewswire('base_steal', BLUE, teamActor(0));
    expect(text(segments)).toBe('Bravo just stole base from Team Red');
    expect(segments[2]).toEqual({ t: 'Team Red', team: 0 });
  });

  it('names every side the same way', () => {
    expect(TEAM_COLORS.map((_, t) => teamActor(t).name)).toEqual([
      'Team Red', 'Team Blue', 'Team Yellow', 'Team Green', 'Team Orange', 'Team Purple',
    ]);
    // The team travels with the name, so the stand-in is painted in that side's colour.
    expect(teamActor(2)).toEqual({ name: 'Team Yellow', team: 2 });
  });

  it('surfaces a corrupt team index instead of laundering it into a word', () => {
    // Unreachable in practice — both steal sites guard on a real team — so if it ever does
    // happen it should be visible, not disguised as a plausible-looking side.
    expect(teamActor(7).name).toBe('Team 7');
  });

  it('names the side when a tank has a team but no nick yet', () => {
    // The server assigns tank.name at onJoinMessage, so a tank can be shot before it is named.
    expect(actorOf({ name: 'Hammer', team: 3 })).toEqual({ name: 'Hammer', team: 3 });
    expect(actorOf({ team: 3 })).toEqual({ name: 'Team Green', team: 3 });
    expect(actorOf({})).toEqual({ name: 'someone', team: null });
  });

  it('colours both sides of a lead change', () => {
    expect(formatNewswire('lead_change', teamActor(5), teamActor(4))).toEqual([
      { t: 'Team Purple', team: 5 },
      { t: ' takes the lead from ', team: null },
      { t: 'Team Orange', team: 4 },
    ]);
  });

  it('rewords the first lead of the game, when nobody held it before', () => {
    expect(text(formatNewswire('lead_change', teamActor(3)))).toBe('Team Green takes the lead');
  });

  it('colours both sides of a position change and none of the prose', () => {
    expect(formatNewswire('position_change', teamActor(5), teamActor(3), SWAP)).toEqual([
      { t: 'Team Purple', team: 5 },
      { t: ' up to second, ', team: null },
      { t: 'Team Green', team: 3 },
      { t: ' down to third', team: null },
    ]);
  });

  it('rotates the wording, so the same sentence is not the whole scoreline', () => {
    const worded = (variant: number) =>
      text(formatNewswire('position_change', teamActor(5), teamActor(3), { ...SWAP, variant }));

    expect(worded(0)).toBe('Team Purple up to second, Team Green down to third');
    expect(worded(1)).toBe('Team Purple climbs to second place, Team Green slips to third');
    expect(worded(2)).toBe('Team Purple overtakes Team Green for second place');
    // A counter, not a random pick: it cycles, and a given variant always reads the same way.
    expect(worded(3)).toBe(worded(0));
    expect(worded(4)).toBe(worded(1));
    // Every shape names both sides in their own colours, whichever one comes up.
    for (const variant of [0, 1, 2]) {
      const segments = formatNewswire('position_change', teamActor(5), teamActor(3), { ...SWAP, variant });
      expect(segments.filter((s) => s.team === 5)).toEqual([{ t: 'Team Purple', team: 5 }]);
      expect(segments.filter((s) => s.team === 3)).toEqual([{ t: 'Team Green', team: 3 }]);
    }
  });

  it('drops the overtake shape when the faller did not land directly below', () => {
    // "overtakes Team Green for second place" would leave a two-place drop unsaid, so a swap
    // that is not adjacent rotates between the two shapes that name both standings.
    const far = { riser: 2, faller: 4 };
    const worded = (variant: number) =>
      text(formatNewswire('position_change', teamActor(5), teamActor(3), { ...far, variant }));

    expect(worded(0)).toBe('Team Purple up to second, Team Green down to fourth');
    expect(worded(1)).toBe('Team Purple climbs to second place, Team Green slips to fourth');
    expect(worded(2)).toBe(worded(0));
    expect(positionShapeCount(far, true)).toBe(2);
    expect(positionShapeCount(SWAP, true)).toBe(3);
    // No side to name, no overtake to describe, whatever the places say.
    expect(positionShapeCount(SWAP, false)).toBe(2);
  });

  it('names every place in the table', () => {
    expect([1, 2, 3, 4, 5, 6].map(placeName))
      .toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'sixth']);
    // Six teams means six places; a seventh is a corrupt index and should be visible as one.
    expect(placeName(7)).toBe('7th');
  });

  it('rewords a position change with no standings rather than inventing one', () => {
    expect(text(formatNewswire('position_change', teamActor(5), teamActor(3))))
      .toBe('Team Purple overtakes Team Green');
    // A riser with no side to name keeps its own standing, in whichever shape came up.
    expect(text(formatNewswire('position_change', teamActor(5), null, { riser: 4, faller: null })))
      .toBe('Team Purple up to fourth');
    expect(text(formatNewswire('position_change', teamActor(5), null, { riser: 4, faller: null, variant: 1 })))
      .toBe('Team Purple climbs to fourth place');
  });

  it('rewords a steal with no previous owner rather than inventing one', () => {
    expect(text(formatNewswire('base_steal', BLUE))).toBe('Bravo just stole a base');
    expect(text(formatNewswire('pill_steal', BLUE))).toBe('Bravo just stole a pillbox');
  });

  it('wraps a line in the wire command', () => {
    expect(newswireMessage('player_quit', RED)).toEqual({
      command: 'news',
      kind: 'player_quit',
      segments: [{ t: 'Redshirt', team: 0 }, { t: ' has quit game', team: null }],
    });
  });

  it('has a header', () => {
    expect(NEWSWIRE_HEADER).toBe('NEWSWIRE');
  });
});

describe('channels', () => {
  it('routes standings events to the score channel and everything else to news', () => {
    expect(channelOf('lead_change')).toBe('score');
    expect(channelOf('position_change')).toBe('score');
    for (const kind of ['base_capture', 'base_steal', 'pill_capture', 'pill_steal',
                        'builder_lost', 'tank_kill', 'tank_mined', 'tank_sunk',
                        'player_join', 'player_quit', 'pill_kill'] as NewswireKind[]) {
      expect(channelOf(kind)).toBe('news');
    }
  });

  it('labels the two channels', () => {
    expect(NEWSWIRE_CHANNEL_LABELS).toEqual({ news: 'NEWSWIRE', score: 'SCORELINE' });
  });
});

describe('updateStandings', () => {
  const scores = (partial: Record<number, number>): number[] =>
    Array.from({ length: 6 }, (_, t) => partial[t] ?? 0);

  /** The teams named in a score table — the sides fielding tanks, in these tests. */
  const fielding = (partial: Record<number, number>) => Object.keys(partial).map(Number);

  /** One recount: score the table, then read the swaps it reports. */
  const recount = (partial: Record<number, number>, previous: number[] | null) =>
    updateStandings(scores(partial), fielding(partial), previous);

  it('says nothing on the first recount — there is no previous table to have changed', () => {
    const first = recount({ 3: 40, 1: 20, 5: 10 }, null);
    expect(first.order).toEqual([3, 1, 5]);
    expect(first.swaps).toEqual([]);
    expect(first.leader).toBe(3);
    expect(first.rebaselined).toBe(false);
  });

  it('reports a mid-table overtake as one swap naming both new places', () => {
    // Purple (5) passes Green (3) for second. Red (0) is untouched on top.
    const before = recount({ 0: 80, 3: 40, 5: 20 }, null);
    expect(before.order).toEqual([0, 3, 5]);
    const after = recount({ 0: 80, 3: 40, 5: 50 }, before.order);
    expect(after.order).toEqual([0, 5, 3]);
    expect(after.swaps).toEqual([{ riser: 5, riserPlace: 2, faller: 3, fallerPlace: 3 }]);
    // The lead did not move, so nothing about first place is reported.
    expect(after.leader).toBe(0);
  });

  it('stays quiet while the table holds', () => {
    const before = recount({ 0: 80, 3: 40, 5: 20 }, null);
    expect(recount({ 0: 82, 3: 41, 5: 19 }, before.order).swaps).toEqual([]);
  });

  it('holds a place through a near-tie rather than trading it every half second', () => {
    const before = recount({ 3: 40, 1: 30 }, null);
    expect(recount({ 3: 40, 1: 40.4 }, before.order).swaps).toEqual([]);
    expect(recount({ 3: 40, 1: 40 + NEWSWIRE_POSITION_MARGIN }, before.order).swaps).toEqual([]);
    expect(recount({ 3: 40, 1: 40 + NEWSWIRE_POSITION_MARGIN + 0.01 }, before.order).swaps)
      .toEqual([{ riser: 1, riserPlace: 1, faller: 3, fallerPlace: 2 }]);
  });

  it('is hysteresis at every boundary, not just at the top', () => {
    // Same test as the lead's, run one rank down: 0 holds first throughout.
    let order = recount({ 0: 90, 3: 40, 1: 30 }, null).order;
    expect(order).toEqual([0, 3, 1]);
    // 1 overtakes 3 decisively for second.
    order = recount({ 0: 90, 3: 40, 1: 45 }, order).order;
    expect(order).toEqual([0, 1, 3]);
    // 3 creeps back level: no announcement, and the order holds.
    const level = recount({ 0: 90, 3: 45.5, 1: 45 }, order);
    expect(level.swaps).toEqual([]);
    expect(level.order).toEqual([0, 1, 3]);
    // 3 pulls clear: announced.
    expect(recount({ 0: 90, 3: 47, 1: 45 }, order).swaps)
      .toEqual([{ riser: 3, riserPlace: 2, faller: 1, fallerPlace: 3 }]);
  });

  it('reports one line per pair when several places change at once', () => {
    const before = recount({ 0: 90, 1: 70, 2: 50, 3: 30 }, null);
    expect(before.order).toEqual([0, 1, 2, 3]);
    // 2 leaps from third to first, and 3 from fourth to third. Each names the side it squeezed
    // in front of, and they do not name the same one twice.
    const after = recount({ 0: 90, 1: 70, 2: 100, 3: 80 }, before.order);
    expect(after.order).toEqual([2, 0, 3, 1]);
    expect(after.swaps).toEqual([
      { riser: 2, riserPlace: 1, faller: 0, fallerPlace: 2 },
      { riser: 3, riserPlace: 3, faller: 1, fallerPlace: 4 },
    ]);
    expect(after.leader).toBe(2);
  });

  it('names no side twice when more teams move up than were passed', () => {
    const before = recount({ 0: 90, 1: 50, 2: 40 }, null);
    expect(before.order).toEqual([0, 1, 2]);
    // 1 and 2 both leap 0, but only 0 fell. The second line keeps its own standing and stops
    // there rather than blaming 0 a second time.
    const after = recount({ 0: 50, 1: 100, 2: 90 }, before.order);
    expect(after.order).toEqual([1, 2, 0]);
    expect(after.swaps).toEqual([
      { riser: 1, riserPlace: 1, faller: 0, fallerPlace: 3 },
      { riser: 2, riserPlace: 2, faller: null, fallerPlace: null },
    ]);
    expect(text(formatNewswire('position_change', teamActor(2), null, { riser: 2, faller: null })))
      .toBe('Team Yellow up to second');
  });

  it('ranks only the teams fielding tanks', () => {
    // Teams 2 and 4 have scores on the board but no players; they are not in the table at all.
    const table = updateStandings(scores({ 0: 90, 2: 80, 3: 40, 4: 70 }), [0, 3], null);
    expect(table.order).toEqual([0, 3]);
  });

  it('rebuilds silently when the roster changes, since the shift is not about play', () => {
    const before = recount({ 0: 90, 1: 70, 2: 50 }, null);
    // Team 1 quits: 2 inherits second place without having earned it.
    const after = updateStandings(scores({ 0: 90, 2: 50 }), [0, 2], before.order);
    expect(after.order).toEqual([0, 2]);
    expect(after.swaps).toEqual([]);
    expect(after.rebaselined).toBe(true);
    // And the next recount announces against the rebuilt table.
    expect(updateStandings(scores({ 0: 90, 2: 95 }), [0, 2], after.order).swaps)
      .toEqual([{ riser: 2, riserPlace: 1, faller: 0, fallerPlace: 2 }]);
  });

  it('will not crown a team on a zero score', () => {
    expect(updateStandings(scores({}), [0, 1, 2], null).leader).toBe(null);
    // ...and an all-zero board reports no movement, whatever order it happens to be in.
    const flat = updateStandings(scores({}), [0, 1, 2], [2, 1, 0]);
    expect(flat.order).toEqual([2, 1, 0]);
    expect(flat.swaps).toEqual([]);
  });

  it('survives an empty table', () => {
    expect(updateStandings(scores({}), [], null))
      .toEqual({ order: [], swaps: [], leader: null, rebaselined: false });
  });
});

describe('teamTextColor', () => {
  const parse = (css: string) => css.match(/\d+/g)!.map(Number) as [number, number, number];

  it('gives every team enough contrast to read on black', () => {
    for (let team = 0; team < TEAM_COLORS.length; team++) {
      const [r, g, b] = parse(teamTextColor(team));
      expect(contrastOnBlack(r, g, b)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('preserves hue exactly, so blue still reads as the blue team', () => {
    for (let team = 0; team < TEAM_COLORS.length; team++) {
      const raw = TEAM_COLORS[team];
      const [r, g, b] = parse(teamTextColor(team));
      expect(rgbToHsl(r, g, b)[0]).toBeCloseTo(rgbToHsl(raw.r, raw.g, raw.b)[0], 0);
    }
  });

  it('never leaves a channel at zero', () => {
    // A channel at zero means the colour is fully saturated in that direction, which on black
    // reads as a thinner, smaller face than the white prose beside it and — at a spectral
    // extreme like red — appears to float off the baseline. Every team clears the floor.
    for (let team = 0; team < TEAM_COLORS.length; team++) {
      const [r, g, b] = parse(teamTextColor(team));
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(MIN_CHANNEL);
    }
  });

  it('lands on the expected palette', () => {
    expect([0, 1, 2, 3, 4, 5].map(teamTextColor)).toEqual([
      'rgb(255,51,51)',    // red    — lifted off pure #ff0000
      'rgb(97,97,255)',    // blue   — lifted for contrast; already clears the channel floor
      'rgb(255,255,51)',   // yellow
      'rgb(51,255,51)',    // green
      'rgb(255,183,51)',   // orange
      'rgb(219,51,219)',   // purple — lifted for contrast, then off its zero green
    ]);
  });

  it('still lifts the two teams that cannot be read raw', () => {
    expect(contrastOnBlack(0, 0, 255)).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(contrastOnBlack(128, 0, 128)).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('only ever raises contrast, never lowers it', () => {
    // The channel-floor pass blends toward white, so it cannot make a colour harder to read.
    for (let team = 0; team < TEAM_COLORS.length; team++) {
      const raw = TEAM_COLORS[team];
      const [r, g, b] = parse(teamTextColor(team));
      expect(contrastOnBlack(r, g, b)).toBeGreaterThanOrEqual(contrastOnBlack(raw.r, raw.g, raw.b));
    }
  });

  it('paints neutral and unknown teams in the HUD chrome colour', () => {
    expect(teamTextColor(255)).toBe(NEUTRAL_TEXT_COLOR);
    expect(teamTextColor(null)).toBe(NEUTRAL_TEXT_COLOR);
    expect(teamTextColor(undefined)).toBe(NEUTRAL_TEXT_COLOR);
    expect(teamTextColor(-1)).toBe(NEUTRAL_TEXT_COLOR);
  });
});
