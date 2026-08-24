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
import TEAM_COLORS from './team_colors';
/** The label each channel puts on the top line. */
export const NEWSWIRE_CHANNEL_LABELS = {
    news: 'NEWSWIRE',
    score: 'SCORELINE',
};
/**
 * Kinds that belong to the score channel rather than the news channel.
 *
 * The expansion point: to give a future event the SCORELINE header, add its kind here and
 * nothing else changes — the channel travels with the kind, which is already on the wire, so
 * there is no protocol change and no client update to make.
 */
const SCORE_KINDS = new Set(['lead_change']);
/** Which channel an event belongs to. Anything not explicitly a score event is news. */
export function channelOf(kind) {
    return SCORE_KINDS.has(kind) ? 'score' : 'news';
}
/** The news channel's label. Kept as a named export because it is the default channel. */
export const NEWSWIRE_HEADER = NEWSWIRE_CHANNEL_LABELS.news;
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
export function teamActor(team) {
    const colour = TEAM_COLORS[team]?.name;
    return { name: `Team ${colour ? colour[0].toUpperCase() + colour.slice(1) : team}`, team };
}
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
export function pillboxActor(team) {
    if (team == null || team === 255)
        return null;
    return teamActor(team);
}
/**
 * Build an actor from anything carrying a name and a team (a Tank, usually).
 *
 * A nameless tank is a real state, unlike a teamless one: the server only assigns `tank.name`
 * in `onJoinMessage`, so a tank exists — and can be shot — before its nick has arrived. Its
 * side is known by then, so name the side rather than inventing a person.
 */
export function actorOf(obj) {
    if (obj.name)
        return { name: obj.name, team: obj.team ?? null };
    if (obj.team != null && obj.team !== 255)
        return teamActor(obj.team);
    // Only before Tank.spawn() has assigned a team, which is before the tank is in play at all.
    return { name: 'someone', team: null };
}
function seg(t) {
    return { t, team: null };
}
function name(actor) {
    return { t: actor.name, team: actor.team };
}
/**
 * Render one event as coloured segments.
 *
 * `other` is the second party, where the event has one: the robbed player for a steal, the
 * victim for a kill. For `tank_kill` specifically, omitting `other` means there was no
 * attributable killer (splash damage, or the tank killed itself) and `actor` is the victim —
 * mirroring the `shell.attribution.$ !== this` guard at the call site, so a self-kill reads
 * "X was destroyed" rather than "X destroyed X".
 */
export function formatNewswire(kind, actor, other) {
    switch (kind) {
        case 'base_capture':
            return [name(actor), seg(' captured a Neutral Base')];
        case 'base_steal':
            // `other` is always supplied — a steal is defined by having a previous owner — but the
            // signature cannot express that, so degrade by rewording rather than by inventing one.
            return other
                ? [name(actor), seg(' just stole base from '), name(other)]
                : [name(actor), seg(' just stole a base')];
        case 'pill_capture':
            return [name(actor), seg(' captured a Neutral Pillbox')];
        case 'pill_steal':
            return other
                ? [name(actor), seg(' just stole pillbox from '), name(other)]
                : [name(actor), seg(' just stole a pillbox')];
        case 'builder_lost':
            // WinBolo said "just lost his builder"; orona does not know the player's gender.
            return [name(actor), seg(' just lost their builder')];
        case 'tank_kill':
            return other
                ? [name(actor), seg(' destroyed '), name(other)]
                : [name(actor), seg(' was destroyed')];
        case 'tank_mined':
            return [name(actor), seg(' was blown up by a mine')];
        case 'tank_sunk':
            return [name(actor), seg(' sank in deep sea')];
        case 'player_join':
            return [name(actor), seg(' has joined the game')];
        case 'player_quit':
            return [name(actor), seg(' has quit game')];
        case 'pill_kill':
            // `actor` is the VICTIM and `other` is the side holding the pill — the reverse of the
            // other two-party kinds, because the victim is the one party always present. Both
            // branches lead with the player and differ only in the pillbox's qualifier, which is the
            // only thing that actually differs between them. That also keeps these lines in the same
            // passive family as every other death a player did not cause: "was blown up by a mine",
            // "sank in deep sea", "was destroyed". "Pillbox" is capitalised to match the
            // WinBolo-inherited strings above ("captured a Neutral Pillbox") — the same object should
            // not be spelled two ways on the same strip.
            return other
                ? [name(actor), seg(' was destroyed by a '), name(other), seg(' Pillbox')]
                : [name(actor), seg(' was destroyed by a Neutral Pillbox')];
        case 'lead_change':
            // Both parties are sides, not players, so both read as "team purple". Omitting `other`
            // means nobody held the lead before — the first team to put a point on the board.
            return other
                ? [name(actor), seg(' takes the lead from '), name(other)]
                : [name(actor), seg(' takes the lead')];
        default: {
            const exhaustive = kind;
            throw new Error(`Unknown newswire kind '${exhaustive}'`);
        }
    }
}
/**
 * How far a challenger must be clear of the field before the lead is called changed.
 *
 * Team scores are continuous — a weighted blend of base share, pillbox share and K/D
 * (`calculateTeamScores`, server/application.ts) — and are recomputed every 25 ticks. Two teams
 * within a whisker of each other would otherwise trade the title twice a second and bury every
 * other event on the wire. A margin makes it hysteresis: having taken the lead, a team keeps it
 * until someone is clearly past them, not merely until someone is nominally ahead.
 *
 * One point is well under the value of a single base (~3 weighted points on a typical map), so
 * this damps float jitter without ever suppressing a real swing.
 */
export const NEWSWIRE_LEAD_MARGIN = 1;
/**
 * Decide whether the lead has changed hands.
 *
 * Returns the new leader's team, or `null` if the title has not moved — which covers the
 * incumbent still being ahead, nobody having scored yet, and the top two being too close to
 * call. `current` is the team that presently holds the title, or `null` if nobody does.
 */
export function findLeadChange(scores, current, margin = NEWSWIRE_LEAD_MARGIN) {
    let leader = -1;
    let best = 0;
    let runnerUp = 0;
    for (let team = 0; team < scores.length; team++) {
        const score = scores[team];
        if (score > best) {
            runnerUp = best;
            best = score;
            leader = team;
        }
        else if (score > runnerUp) {
            runnerUp = score;
        }
    }
    if (leader < 0 || best <= 0)
        return null; // nobody has scored yet
    if (leader === current)
        return null; // incumbent holds the title
    if (best - runnerUp <= margin)
        return null; // too close to call
    return leader;
}
/** Build the JSON command for one event. */
export function newswireMessage(kind, actor, other) {
    return { command: 'news', kind, segments: formatNewswire(kind, actor, other) };
}
//# sourceMappingURL=newswire.js.map