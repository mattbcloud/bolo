/**
 * Orona uses two WebSocket connections during play. The first is the lobby connection, which is
 * always open, and is also used for in-game chat. The second is used for world synchronization,
 * which is kept separate so that the lobby connection cannot impede network performance of game
 * updates (or at least diminish the effect).
 *
 * The collecting of data of world updates is governed by this module. World updates are split up
 * in two kinds of messages.
 *
 * The first are critical updates, which are object creation an destruction. Both the server and
 * client have lists of objects that are kept in sync. In order to do that, these updates are
 * transmitted reliably to clients. (But actual transport is not done by this module.)
 *
 * The second are attribute updates for existing objects. A single update message of this kind
 * (currently) contains a complete set of updates for all world objects. There are no differential
 * updates, so it's okay for the underlying transport to drop some of these.
 */
// These are the server message identifiers both sides need to know about.
// The server sends binary data (encoded as base64). So we need to compare character codes.
export const SYNC_MESSAGE = 's'.charCodeAt(0);
export const WELCOME_MESSAGE = 'W'.charCodeAt(0);
export const CREATE_MESSAGE = 'C'.charCodeAt(0);
export const DESTROY_MESSAGE = 'D'.charCodeAt(0);
export const MAPCHANGE_MESSAGE = 'M'.charCodeAt(0);
export const UPDATE_MESSAGE = 'U'.charCodeAt(0);
export const TINY_UPDATE_MESSAGE = 'u'.charCodeAt(0);
export const SOUNDEFFECT_MESSAGE = 'S'.charCodeAt(0);
// And these are the client's messages. The client just sends one-character ASCII messages.
export const START_TURNING_CCW = 'L';
export const STOP_TURNING_CCW = 'l';
export const START_TURNING_CW = 'R';
export const STOP_TURNING_CW = 'r';
export const START_ACCELERATING = 'A';
export const STOP_ACCELERATING = 'a';
export const START_BRAKING = 'B';
export const STOP_BRAKING = 'b';
export const START_SHOOTING = 'S';
export const STOP_SHOOTING = 's';
export const INC_RANGE = 'I';
export const DEC_RANGE = 'D';
export const BUILD_ORDER = 'O';
//# sourceMappingURL=net.js.map