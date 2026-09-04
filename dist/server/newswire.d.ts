/**
 * Newswire — the shared event vocabulary.
 *
 * A port of WinBolo's `newsWireMessage` channel (`brains/winbolo/winbolo/src/bolo/messages.c`,
 * strings in `.../gui/win32/translate.txt:507-518`). This module is imported by both the server
 * and the client, so it must stay pure: no DOM, no imports from either side.
 *
 * Lines are formatted into *coloured segments* rather than a flat string. WinBolo formatted
 * per-client because its name labels carried a user-selectable `@hostname` suffix; orona names
 * have no such variance, so per-client formatting buys nothing — but the segment form is what
 * lets the ticker paint each player's name in their team colour, and what lets the team be
 * stamped at emit time (by the time a line reaches the visible window, the actor's tank may be
 * destroyed, respawned, or back on a different team).
 */
export type NewswireKind = 'base_capture' | 'base_steal' | 'pill_capture' | 'pill_steal' | 'builder_lost' | 'tank_kill' | 'tank_mined' | 'tank_sunk' | 'player_join' | 'player_quit' | 'lead_change' | 'position_change' | 'pill_kill';
/** One run of same-coloured text. `team: null` means default prose colour. */
export interface NewswireSegment {
    t: string;
    team: number | null;
}
/** Who a line is about. `team` may be null for an unknown/neutral player. */
export interface NewswireActor {
    name: string;
    team: number | null;
}
/**
 * The strip's channels. WinBolo's `messages.c` carried twenty-one of these — newswire,
 * assistant, AI, network status, one per player — and showed the channel's name on the top
 * line whenever the channel changed. This is the same idea with two of them.
 */
export type NewswireChannel = 'news' | 'score';
/** The label each channel puts on the top line. */
export declare const NEWSWIRE_CHANNEL_LABELS: Record<NewswireChannel, string>;
/** Which channel an event belongs to. Anything not explicitly a score event is news. */
export declare function channelOf(kind: NewswireKind): NewswireChannel;
/** The news channel's label. Kept as a named export because it is the default channel. */
export declare const NEWSWIRE_HEADER: string;
/**
 * A stand-in actor for a player whose name is not recoverable — a base whose previous owner has
 * disconnected, say. The colour cue survives even though the name is gone.
 *
 * Reads "Team Yellow", not "the yellow team". It is standing in the slot where a player's name
 * would be, so it should read as a name for the side rather than as a description of it:
 * "just stole base from Team Yellow" sits in the sentence the way "from Redshirt" does. Both
 * words are capitalised for the same reason — it is a proper name, and stays capitalised
 * mid-sentence exactly as a player's nick does. `TEAM_COLORS` stores its names in lower case
 * for CSS and logging, so the capital is applied here rather than at the source; nothing else
 * in the codebase reads `TEAM_COLORS[].name`.
 *
 * The team is required, not optional. Every caller reaches this only after establishing a real
 * side — the steal branches in world_base/world_pillbox run behind a `previousTeam != null &&
 * previousTeam !== 255` guard — so a "neutral team" here would be a state that cannot occur.
 * The `?? team` on the lookup is not a graceful fallback for that: it is there so a genuinely
 * corrupt index prints as "team 7" and can be seen, rather than being laundered into a
 * plausible-looking word.
 */
export declare function teamActor(team: number): NewswireActor;
/**
 * The shooter of a pillbox's shell: a side, never a person.
 *
 * A pillbox picks its targets purely by team — `world_pillbox.ts:245-247` reads `this.team` and
 * never consults `this.owner` — so a pill is a team emplacement, and a pill kill belongs to the
 * team that holds it. The engine's `shell.attribution` credits the owner *tank* instead
 * (`shell.ts:89-97`, a 2010 decision made for scoring), which names a player who had no part in
 * the shot, and names them inconsistently: when a pill's owner disconnects, `world_mixin.ts:96-97`
 * nulls the owner ref but keeps the team, so the same pill on the same side would print a name
 * or not depending on who happens to still be connected. The team is the stable, truthful answer.
 *
 * Returns `null` for a neutral pill. That is not a failure to identify one: a neutral pill
 * genuinely belongs to no side — it shoots everyone — so there is no name to give and no colour
 * to give it. `formatNewswire` reads the absence directly and leads with the victim instead.
 */
export declare function pillboxActor(team: number | null | undefined): NewswireActor | null;
/**
 * Build an actor from anything carrying a name and a team (a Tank, usually).
 *
 * A nameless tank is a real state, unlike a teamless one: the server only assigns `tank.name`
 * in `onJoinMessage`, so a tank exists — and can be shot — before its nick has arrived. Its
 * side is known by then, so name the side rather than inventing a person.
 */
export declare function actorOf(obj: {
    name?: string;
    team?: number | null;
}): NewswireActor;
export declare function placeName(place: number): string;
/**
 * What a `position_change` line reports beyond its two parties: where each of them landed, and
 * which of the phrasings to use.
 *
 * `faller` is the second team's *new* place, null when there is no second team to name — see
 * `NewswirePositionSwap`. `variant` rotates the wording; the caller supplies a counter rather
 * than a random number so a given line is reproducible, and so consecutive lines are guaranteed
 * to differ instead of merely being likely to.
 */
export interface NewswirePositionDetail {
    riser: number;
    faller: number | null;
    variant?: number;
}
/**
 * How many ways a position change can be worded. One phrasing, repeated every time the table
 * moves, stops being read after the first evening — the eye files it as furniture. These are
 * three different *sentences*, not three synonyms for the same one, because a rotation between
 * near-identical lines still reads as a single line.
 *
 * The overtake shape names only the riser's place, so it is used only when the faller landed
 * directly below — where its place is implied and nothing is lost. `positionShapeCount` is what
 * decides that, and it is exported so the caller can reason about the rotation the same way.
 */
export declare function positionShapeCount(detail: NewswirePositionDetail, named: boolean): number;
/**
 * Render one event as coloured segments.
 *
 * `other` is the second party, where the event has one: the robbed player for a steal, the
 * victim for a kill. For `tank_kill` specifically, omitting `other` means there was no
 * attributable killer (splash damage, or the tank killed itself) and `actor` is the victim —
 * mirroring the `shell.attribution.$ !== this` guard at the call site, so a self-kill reads
 * "X was destroyed" rather than "X destroyed X".
 *
 * `detail` is read by `position_change` alone and ignored by every other kind.
 */
export declare function formatNewswire(kind: NewswireKind, actor: NewswireActor, other?: NewswireActor | null, detail?: NewswirePositionDetail | null): NewswireSegment[];
/**
 * How far a challenger must be clear of the team above before a position is called changed.
 *
 * Team scores are continuous — a weighted blend of base share, pillbox share and K/D
 * (`calculateTeamScores`, server/application.ts) — and are recomputed every 25 ticks. Two teams
 * within a whisker of each other would otherwise trade places twice a second and bury every
 * other event on the wire. A margin makes it hysteresis: having taken a place, a team keeps it
 * until someone is clearly past them, not merely until someone is nominally ahead.
 *
 * One point is well under the value of a single base (~3 weighted points on a typical map), so
 * this damps float jitter without ever suppressing a real swing. It applies at every boundary
 * in the table, not just at the top: third place is as prone to jitter as first.
 */
export declare const NEWSWIRE_POSITION_MARGIN = 1;
/**
 * One team overtaking another, with where each of them ended up (1-based).
 *
 * `faller` is null only in a pile-up, where more teams moved up than there are sides to say they
 * went past — see `updateStandings`. The riser's own new place is always known.
 */
export interface NewswirePositionSwap {
    riser: number;
    riserPlace: number;
    faller: number | null;
    fallerPlace: number | null;
}
/** The state of the table after one recount. */
export interface NewswireStandings {
    /** The ranked teams, best first. Feed this back in as `previous` on the next recount. */
    order: number[];
    /** The overtakes to announce. Empty on the first recount and whenever the roster changed. */
    swaps: NewswirePositionSwap[];
    /** The team on top with a positive score, or `null` while the board is empty. */
    leader: number | null;
    /**
     * True when the table was rebuilt from scratch because the set of ranked teams changed. The
     * order is still current — only the swaps are not worth saying out loud. See `updateStandings`.
     */
    rebaselined: boolean;
}
/**
 * Recount the table and report which teams changed places.
 *
 * `eligible` is the set of teams to rank — the sides actually fielding tanks. Ranking the other
 * three would mean announcing that an empty team "falls to fifth place" every time the scores
 * drift, which is noise about nobody.
 *
 * `previous` is the order this function returned last time, or `null` on the first recount. It
 * is not merely a diff baseline: it is the seed the new order is sorted *from*, which is what
 * makes the margin hysteresis rather than a threshold. Teams within a margin of each other keep
 * the order they already had, so a pair trading hundredths of a point sits still, and a team
 * that has genuinely pulled clear moves exactly once.
 *
 * When the eligible set itself changes — someone joins, someone quits — the table is rebuilt and
 * `rebaselined` is set with no swaps reported. A team that quits pushes everyone below it up a
 * place, and that is an artefact of the roster, not of anything that happened in the game; the
 * caller re-seeds silently and announces again from the next recount.
 */
export declare function updateStandings(scores: readonly number[], eligible: Iterable<number>, previous: readonly number[] | null, margin?: number): NewswireStandings;
/** The wire shape broadcast by the server and replayed from the backlog. */
export interface NewswireMessage {
    command: 'news';
    kind: NewswireKind;
    segments: NewswireSegment[];
}
/** Build the JSON command for one event. */
export declare function newswireMessage(kind: NewswireKind, actor: NewswireActor, other?: NewswireActor | null, detail?: NewswirePositionDetail | null): NewswireMessage;
//# sourceMappingURL=newswire.d.ts.map