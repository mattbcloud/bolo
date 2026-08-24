import { describe, it, expect } from 'vitest';

import {
  formatNewswire, teamActor, actorOf, pillboxActor, newswireMessage, findLeadChange, channelOf,
  NEWSWIRE_HEADER, NEWSWIRE_CHANNEL_LABELS, NEWSWIRE_LEAD_MARGIN, NewswireKind,
} from './newswire';
import TEAM_COLORS, { teamTextColor, contrastOnBlack, rgbToHsl, NEUTRAL_TEXT_COLOR, MIN_TEXT_CONTRAST, MIN_CHANNEL } from './team_colors';

const RED = { name: 'Redshirt', team: 0 };
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
  it('routes lead changes to the score channel and everything else to news', () => {
    expect(channelOf('lead_change')).toBe('score');
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

describe('findLeadChange', () => {
  const scores = (partial: Record<number, number>): number[] =>
    Array.from({ length: 6 }, (_, t) => partial[t] ?? 0);

  it('says nothing while the board is empty', () => {
    expect(findLeadChange(scores({}), null)).toBe(null);
  });

  it('calls the first team to score', () => {
    expect(findLeadChange(scores({ 3: 12 }), null)).toBe(3);
  });

  it('stays quiet while the incumbent is still ahead', () => {
    expect(findLeadChange(scores({ 3: 40, 1: 20 }), 3)).toBe(null);
  });

  it('calls a real overtake', () => {
    expect(findLeadChange(scores({ 3: 40, 1: 55 }), 3)).toBe(1);
  });

  it('holds the title through a near-tie rather than trading it every half second', () => {
    // The whole point of the margin: 40.0 vs 40.4 is noise, not a lead change.
    expect(findLeadChange(scores({ 3: 40, 1: 40.4 }), 3)).toBe(null);
    expect(findLeadChange(scores({ 3: 40, 1: 40 + NEWSWIRE_LEAD_MARGIN }), 3)).toBe(null);
    expect(findLeadChange(scores({ 3: 40, 1: 40 + NEWSWIRE_LEAD_MARGIN + 0.01 }), 3)).toBe(1);
  });

  it('is hysteresis, not a one-way ratchet — the old leader must also clear the margin', () => {
    let leader: number | null = 3;
    // 1 overtakes decisively.
    leader = findLeadChange(scores({ 3: 40, 1: 45 }), leader) ?? leader;
    expect(leader).toBe(1);
    // 3 creeps back level: no announcement.
    expect(findLeadChange(scores({ 3: 45.5, 1: 45 }), leader)).toBe(null);
    // 3 pulls clear: announced.
    expect(findLeadChange(scores({ 3: 47, 1: 45 }), leader)).toBe(3);
  });

  it('will not crown a team on a zero score', () => {
    expect(findLeadChange(scores({}), 2)).toBe(null);
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
