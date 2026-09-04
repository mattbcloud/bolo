/**
 * Player names: one to a game.
 *
 * Kept here, apart from the server that enforces it, because the rule is a piece of vocabulary
 * rather than transport — the same reason src/newswire.ts holds the event vocabulary. Nothing in
 * this module touches the network, the DOM or a world object.
 */
/**
 * The name as it will be stored and compared: surrounding whitespace is not part of a name.
 *
 * Trimming happens before the duplicate test AND before the name is stored, so " Bob " cannot
 * enter a game that already holds "Bob", and cannot sit in the roster looking like a second Bob
 * if it does get in.
 */
export function normalizeNick(nick) {
    return nick.trim();
}
/**
 * Is this name already in use?
 *
 * Compared case-insensitively: "Bob" and "bob" are the same player to anyone reading chat, the
 * newswire, or a name label over a tank, and telling those two apart mid-game is exactly the
 * confusion this prevents.
 *
 * `holders` is every tank in the game. A tank left behind by a dropped connection is still one of
 * them and still holds its name until the reaper clears it, so a player returning inside that
 * window is refused their own name — deliberately, since the alternative is a rule that lets one
 * client take a name off another client's live tank. Tanks without a name (spawned, nick not yet
 * set) hold nothing and are skipped.
 */
export function isNickTaken(holders, nick) {
    const wanted = normalizeNick(nick).toLowerCase();
    if (!wanted)
        return false;
    return holders.some((holder) => typeof holder?.name === 'string' && normalizeNick(holder.name).toLowerCase() === wanted);
}
//# sourceMappingURL=nick.js.map