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
export declare const SYNC_MESSAGE: number;
export declare const WELCOME_MESSAGE: number;
export declare const CREATE_MESSAGE: number;
export declare const DESTROY_MESSAGE: number;
export declare const MAPCHANGE_MESSAGE: number;
export declare const UPDATE_MESSAGE: number;
export declare const TINY_UPDATE_MESSAGE: number;
export declare const SOUNDEFFECT_MESSAGE: number;
export declare const START_TURNING_CCW = "L";
export declare const STOP_TURNING_CCW = "l";
export declare const START_TURNING_CW = "R";
export declare const STOP_TURNING_CW = "r";
export declare const START_ACCELERATING = "A";
export declare const STOP_ACCELERATING = "a";
export declare const START_BRAKING = "B";
export declare const STOP_BRAKING = "b";
export declare const START_SHOOTING = "S";
export declare const STOP_SHOOTING = "s";
export declare const START_LAY_MINE = "M";
export declare const STOP_LAY_MINE = "m";
export declare const INC_RANGE = "I";
export declare const DEC_RANGE = "D";
export declare const BUILD_ORDER = "O";
//# sourceMappingURL=net.d.ts.map