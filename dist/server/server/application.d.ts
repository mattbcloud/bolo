/**
 * Server Application
 *
 * This module contains all the juicy code related to the server. It exposes a factory function
 * that returns a Connect-based HTTP server. A single server is capable of hosting multiple games,
 * sharing the interval timer and the lobby across these games.
 */
import * as http from 'http';
import { MapIndex } from './map_index';
import { BoloWorldMixin as BoloWorldMixinInterface } from '../world_mixin';
import { ServerWorld } from '../villain/world/net/server';
export declare class BoloServerWorld extends ServerWorld implements BoloWorldMixinInterface {
    authority: boolean;
    map: any;
    clients: any[];
    oddTick: boolean;
    changes: any[];
    newlyCreated: Set<any>;
    gid?: string;
    url?: string;
    tanks: any[];
    emptyStartTime: number | null;
    teamScoresTick: number;
    boloInit: () => void;
    addTank: (tank: any) => void;
    removeTank: (tank: any) => void;
    getAllMapObjects: () => any[];
    spawnMapObjects: () => void;
    resolveMapObjectOwners: () => void;
    constructor(map: any);
    insert(obj: any): void;
    close(): void;
    /**
     * Calculate team scores based on bases, pillboxes, and K/D ratio.
     * Returns an array of scores for each team (0-5).
     */
    calculateTeamScores(): number[];
    /**
     * Update, and then send packets to the client.
     */
    tick(): void;
    /**
     * Emit a sound effect from the given location. `owner` is optional.
     */
    soundEffect(sfx: number, x: number, y: number, owner?: any): void;
    /**
     * Record map changes.
     */
    mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void;
    onConnect(ws: any): void;
    onEnd(ws: any, code: number, reason: string): void;
    onMessage(ws: any, message: any): void;
    onSimpleMessage(ws: any, message: string): void;
    onJsonMessage(ws: any, messageStr: string): void;
    /**
     * Creates a tank for a connection and synchronizes it to everyone. Then tells the connection
     * that this new tank is his.
     */
    onJoinMessage(ws: any, message: any): void;
    onTextMessage(ws: any, tank: any, message: any): void;
    onTeamTextMessage(ws: any, tank: any, message: any): void;
    onError(ws: any, error: Error): void;
    /**
     * Simple helper to send a message to everyone (only synchronized clients).
     */
    broadcast(message: string): void;
    /**
     * We send critical updates every frame, and non-critical updates every other frame. On top of
     * that, non-critical updates may be dropped, if the client's hearbeats are interrupted.
     */
    sendPackets(): void;
    /**
     * Get a data stream for critical updates. The optional `fullCreate` flag is used to transmit
     * create messages that include state, which is needed when not followed by an update packet.
     * The `isInitialSync` flag indicates we're building a full sync for a new client, so we should
     * not add objects to newlyCreated.
     */
    changesPacket(fullCreate: boolean, isInitialSync?: boolean): number[];
    /**
     * Get a data stream for non-critical updates.
     */
    updatePacket(): number[];
}
interface ServerConfig {
    web: {
        port: number;
        log?: boolean;
        hostname?: string;
    };
    general: {
        base: string;
        maxgames: number;
    };
    irc?: any;
}
export declare class Application {
    options: ServerConfig;
    connectServer: any;
    httpServer: http.Server;
    games: Record<string, any>;
    ircClients: any[];
    maps: MapIndex;
    loop: any;
    demo?: any;
    tickCounter: number;
    constructor(options?: ServerConfig);
    resetDemo(cb?: (err: string | null) => void): void;
    haveOpenSlots(): boolean;
    createGameId(): string;
    createGame(mapData: Buffer): any;
    closeGame(game: any): void;
    registerIrcClient(irc: any): void;
    listen(...args: any[]): void;
    shutdown(): void;
    startLoop(): void;
    possiblyStopLoop(): void;
    tick(): void;
    /**
     * Determine what will handle a WebSocket's 'connect' event, based on the requested resource.
     */
    getSocketPathHandler(pathname: string): ((ws: any) => void) | false;
}
/**
 * Don't export a server directly, but this factory function. Once called, the timer loop will
 * start. I believe it's untidy to have timer loops start after a simple require().
 */
declare function createBoloApp(options: ServerConfig): Application;
export default createBoloApp;
//# sourceMappingURL=application.d.ts.map