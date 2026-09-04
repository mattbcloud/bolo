/**
 * Server Application
 *
 * This module contains all the juicy code related to the server. It exposes a factory function
 * that returns a Connect-based HTTP server. A single server is capable of hosting multiple games,
 * sharing the interval timer and the lobby across these games.
 */
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { MapIndex } from './map_index';
import * as helpers from '../helpers';
import BoloWorldMixin from '../world_mixin';
import { newswireMessage, updateStandings, teamActor, } from '../newswire';
import { isNickTaken, normalizeNick } from '../nick';
import * as allObjectsModule from '../objects/all';
import { Tank } from '../objects/tank';
import WorldMap from '../world_map';
import * as net from '../net';
import { MAP_SIZE_TILES, OVERVIEW_SIGHT_TILES, TICK_LENGTH_MS, TILE_SIZE_WORLD } from '../constants';
import { firebaseService } from './firebase.js';
import { statsService } from './stats-service.js';
import { createLoop } from '../villain/loop';
import { ServerWorld } from '../villain/world/net/server';
import { pack } from '../struct';
import connect from 'connect';
import serveStatic from 'serve-static';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const { random: mathRandom, round: mathRound } = Math;
const allObjects = allObjectsModule;
// Helper function to get team name from team number
function getTeamName(team) {
    const teamNames = ['RED', 'BLUE', 'YELLOW', 'GREEN', 'ORANGE', 'PURPLE'];
    return teamNames[team] || 'NEUTRAL';
}
// Server World
export class BoloServerWorld extends ServerWorld {
    constructor(map) {
        super();
        this.authority = true;
        this.clients = [];
        this.oddTick = false;
        this.changes = [];
        this.newlyCreated = new Set(); // Track objects created this tick
        this.tanks = [];
        this.emptyStartTime = null; // Track when game became empty
        this.teamScoresTick = 0; // Counter for sending team scores
        // The team currently holding the lead, for the newswire. Null until someone scores.
        this.leadTeam = null;
        // The scoreline's standing order — the teams fielding tanks, best first. Null until the first
        // recount; fed back into updateStandings() so its margin acts as hysteresis. See newswire.ts.
        this.standings = null;
        // ── Team discovered map (overview) ───────────────────────────────────────
        // One byte per tile per team, recording every tile any tank on that team has been near.
        // The client keeps its own copy for what it witnesses live, but only the server can tell
        // a joining player what their team explored before they connected — a client cannot
        // reconstruct history it never saw. Allocated lazily, so a team nobody plays costs
        // nothing, and scoped to this game instance, so a new game starts unexplored.
        this.teamDiscovered = [];
        this.teamDiscoveredPending = []; // tiles discovered since the last delta was sent
        this.teamDiscoveredTick = 0;
        // Classic Bolo game mode — differs ONLY in respawn resupply (armour always full = 40):
        //   'open'       training: respawn full bullets (40) + full mines + full trees.
        //   'tournament' respawn bullets = min(40, 2 × neutral-base count); 0 mines, 0 trees.
        //   'strict'     respawn 0 bullets ALWAYS (even first spawn); 0 mines, 0 trees.
        // No victory condition — the "all bases owned" lockout is emergent from the ammo economy.
        this.gameMode = 'open';
        this._stateDumpTick = 0;
        this.map = map;
        this.boloInit();
        this.clients = [];
        this.map.world = this;
        this.oddTick = false;
        this.spawnMapObjects();
        this.emptyStartTime = Date.now(); // Game starts empty
    }
    insert(obj) {
        // Insert an already-instantiated object (used for map objects like pillboxes and bases)
        obj.idx = this.objects.length;
        // Set the network type index based on the object's class
        const typeIdx = this.constructor.typesByName.get(obj.constructor.name);
        if (typeIdx !== undefined) {
            obj._net_type_idx = typeIdx;
        }
        this.objects.push(obj);
        this.changes.push(['create', obj, obj.idx]);
    }
    close() {
        for (const client of this.clients) {
            client.end();
        }
    }
    /**
     * Calculate team scores based on bases, pillboxes, and K/D ratio.
     * Returns an array of scores for each team (0-5).
     */
    calculateTeamScores() {
        const teamScores = [0, 0, 0, 0, 0, 0]; // Scores for teams 0-5
        // Count bases and pillboxes per team
        const baseCounts = [0, 0, 0, 0, 0, 0];
        const pillCounts = [0, 0, 0, 0, 0, 0];
        // Count total bases and pillboxes (excluding neutral)
        let totalBases = 0;
        let totalPills = 0;
        for (const base of this.map.bases) {
            if (base.team !== null && base.team !== 255 && base.team >= 0 && base.team <= 5) {
                baseCounts[base.team]++;
                totalBases++;
            }
        }
        for (const pill of this.map.pills) {
            if (pill.team !== null && pill.team !== 255 && pill.team >= 0 && pill.team <= 5) {
                pillCounts[pill.team]++;
                totalPills++;
            }
        }
        // Calculate K/D ratio per team
        const teamKills = [0, 0, 0, 0, 0, 0];
        const teamDeaths = [0, 0, 0, 0, 0, 0];
        for (const tank of this.tanks) {
            if (tank.team >= 0 && tank.team <= 5) {
                teamKills[tank.team] += tank.kills || 0;
                teamDeaths[tank.team] += tank.deaths || 0;
            }
        }
        // Calculate final scores for each team
        for (let team = 0; team < 6; team++) {
            // Base score: (Team's Bases / Total Bases) × 100
            const baseScore = totalBases > 0 ? (baseCounts[team] / totalBases) * 100 : 0;
            // Pillbox score: (Team's Pillboxes / Total Pillboxes) × 100
            const pillScore = totalPills > 0 ? (pillCounts[team] / totalPills) * 100 : 0;
            // Combat score: min(Team K/D / 3.0, 1.0) × 100
            const kd = teamDeaths[team] > 0 ? teamKills[team] / teamDeaths[team] : teamKills[team];
            const normalizedKD = Math.min(kd / 3.0, 1.0);
            const combatScore = normalizedKD * 100;
            // Weighted total: (Base × 0.50) + (Pill × 0.30) + (Combat × 0.20)
            teamScores[team] = (baseScore * 0.50) + (pillScore * 0.30) + (combatScore * 0.20);
        }
        return teamScores;
    }
    // Callbacks
    /**
     * Update, and then send packets to the client.
     */
    tick() {
        super.tick();
        // Forest regeneration - check a few random cells each tick
        // This spreads the work out rather than checking all cells periodically
        for (let i = 0; i < 3; i++) {
            const x = Math.floor(Math.random() * 256);
            const y = Math.floor(Math.random() * 256);
            const cell = this.map.cellAtTile(x, y);
            // Only regenerate on grass tiles (not bases, pillboxes, or other terrain)
            if (cell.isType('.') && !cell.base && !cell.pill) {
                // Count neighboring forest cells
                let forestCount = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0)
                            continue;
                        const neighbor = cell.neigh(dx, dy);
                        if (neighbor.isType('#'))
                            forestCount++;
                    }
                }
                // Higher chance with more forest neighbors
                // Base rate: 0.00005 per tick (very slow natural growth)
                // With neighbors: up to 0.0004 per tick (8 neighbors * 0.00005 each)
                const growthChance = 0.00005 * (1 + forestCount);
                if (Math.random() < growthChance) {
                    cell.setType('#');
                }
            }
        }
        if (++this._stateDumpTick % 50 === 0)
            this._dumpAuthoritativeState();
        this.sendPackets();
    }
    /**
     * Server-AUTHORITATIVE state dump (debug ground truth). The AI brain runs client-side on a
     * possibly-STALE view (its cached worldMap, phantom targets); the brain-state dump faithfully
     * records that view but it can diverge from reality. This writes the TRUE simulation state —
     * every real tank, every deployed builder/man, and the REAL terrain around each tank — to
     * /tmp/bolo-server-state.jsonl so analysis can (a) know what's actually there and (b) DIFF it
     * against the brain's belief to locate stale-perception bugs. Every 50 ticks (~1/s). Never throws.
     */
    _dumpAuthoritativeState() {
        try {
            const tanks = this.tanks.map((t) => ({
                idx: t.tank_idx,
                name: t.name ?? null,
                team: t.team,
                tile: (t.x != null && t.y != null) ? [(t.x >> 8) & 0xFF, (t.y >> 8) & 0xFF] : null,
                armour: t.armour,
                onBoat: !!t.onBoat,
            }));
            // Deployed builders (the "men" the brain hunts). order 0 = inTank (position null); anything
            // else with a position is a real man on the ground.
            const men = [];
            for (const t of this.tanks) {
                const b = t.builder?.$ ?? t.builder;
                if (b && b.order !== 0 && b.x != null && b.y != null) {
                    men.push({ team: b.team ?? t.team, order: b.order, tile: [(b.x >> 8) & 0xFF, (b.y >> 8) & 0xFF], ownerIdx: t.tank_idx });
                }
            }
            // REAL terrain (9x9) around each tank — ground truth to compare against the brain's worldMap.
            const terrain = {};
            for (const t of this.tanks) {
                if (t.x == null || t.y == null)
                    continue;
                const cx = (t.x >> 8) & 0xFF, cy = (t.y >> 8) & 0xFF;
                const rows = [];
                for (let dy = -4; dy <= 4; dy++) {
                    let row = '';
                    for (let dx = -4; dx <= 4; dx++) {
                        const c = this.map.cellAtTile((cx + dx) & 0xFF, (cy + dy) & 0xFF);
                        row += c?.type?.ascii ?? '?';
                    }
                    rows.push(row);
                }
                terrain[`${cx},${cy}`] = rows;
            }
            const dump = { ts: Date.now(), tick: this._stateDumpTick, tanks, men, terrain,
                pills: this.map.pills.length, bases: this.map.bases.length };
            fs.appendFile('/tmp/bolo-server-state.jsonl', JSON.stringify(dump) + '\n', () => { });
        }
        catch { /* diagnostics must never break the server tick */ }
    }
    /**
     * Emit a sound effect from the given location. `owner` is optional.
     */
    soundEffect(sfx, x, y, owner) {
        const ownerIdx = owner != null ? owner.idx : 65535;
        this.changes.push(['soundEffect', sfx, x, y, ownerIdx]);
    }
    /**
     * Record map changes.
     */
    mapChanged(cell, oldType, hadMine, oldLife) {
        const ascii = cell.type.ascii;
        this.changes.push(['mapChange', cell.x, cell.y, ascii, cell.life, cell.mine]);
        // Catch-up buffer for not-yet-synchronized clients. A client's ONLY terrain snapshot is
        // the map.dump taken in onConnect (socket-open); it does not receive mapChange deltas until
        // ws.synchronized flips true (post onJoinMessage + one tick, line ~654). Every terrain
        // change during that [connect → sync] window would otherwise be lost forever — leaving stale
        // cells (classic case: a forest harvested while the joining client sits on the join screen
        // stays 'forest' on that client → the brain's _findAdjacentForest picks a phantom forest →
        // the builder harvests nothing → PlacePill farm freeze). Record every change for each pending
        // client so we can replay them as MAPCHANGE deltas the instant it synchronizes.
        for (const c of this.clients) {
            if (c.catchupChanges && !c.synchronized) {
                if (c.catchupChanges.length < 50000) {
                    c.catchupChanges.push(['mapChange', cell.x, cell.y, ascii, cell.life, cell.mine]);
                }
                else if (!c.catchupOverflow) {
                    c.catchupOverflow = true;
                    console.log('[CATCHUP] buffer overflow (>50k) — client on the join screen too long; some terrain may stay stale until it changes again.');
                }
            }
        }
    }
    // Connection handling
    onConnect(ws) {
        // Set-up the websocket parameters.
        this.clients.push(ws);
        ws.heartbeatTimer = 0;
        ws.pingTimer = 0;
        // Split liveness counters, purely diagnostic. heartbeatTimer is reset by EITHER signal,
        // so once it trips we can no longer tell which one died. These two are reset only by
        // their own signal: the app-level heartbeat (an inbound message) and the protocol pong.
        // Which of them stops first says where the fault is — see the [REAP] log.
        ws.sinceMessage = 0;
        ws.sincePong = 0;
        ws.silenceWarned = false;
        ws.synchronized = false; // Mark client as not yet synchronized
        ws.on('message', (data) => this.onMessage(ws, data));
        ws.on('close', (code, reason) => this.onEnd(ws, code, reason));
        // Protocol-level liveness. A browser answers a WebSocket ping from its network stack
        // without running any page JavaScript, so a pong proves the socket is alive even when
        // the tab is backgrounded and its timers are throttled to ~1 Hz — which is exactly
        // what happens to every already-connected player the moment someone opens another tab
        // to join. The app-level heartbeat alone can't survive that throttling.
        ws.on('pong', () => { ws.heartbeatTimer = 0; ws.sincePong = 0; });
        // Send the current map state. We don't send pillboxes and bases, because the client
        // receives create messages for those, and then fills the map structure based on those.
        // The client expects this as a separate message.
        let packet = this.map.dump({ noPills: true, noBases: true });
        packet = Buffer.from(packet).toString('base64');
        ws.send(packet);
        // Baseline captured — start recording terrain changes for this client until it synchronizes,
        // so the [connect → sync] delta gap can be replayed at sync (see mapChanged). Without this,
        // any terrain change during the join-screen window is lost and that cell stays stale forever.
        ws.catchupChanges = [];
        ws.catchupOverflow = false;
        // To synchronize the object list to the client, we use changesPacket with fullCreate=true
        // This sends CREATE messages followed by TINY_UPDATE messages for each object
        // Build a snapshot of all existing objects at this moment, including nulls to preserve indices
        // The client needs to have the same sparse array structure as the server
        const objectsSnapshot = this.objects.map(obj => obj);
        // Replace changes array with snapshot - include nulls to preserve indices
        this.changes = objectsSnapshot.map((obj, idx) => obj ? ['create', obj, idx] : ['create', null, idx]);
        let packetData = this.changesPacket(true, true); // Pass isInitialSync=true for first client
        packet = Buffer.from(packetData).toString('base64');
        ws.send(packet);
        // Don't restore old changes - changesPacket() cleared this.changes
        // Any new changes that happened during packet building will be broadcast on next tick
        // Synchronize all player names.
        const messages = this.tanks.map((tank) => ({
            command: 'nick',
            idx: tank.idx,
            nick: tank.name,
        }));
        ws.send(JSON.stringify(messages));
        // Send SYNC_MESSAGE to tell the client that initial sync is complete
        // The client needs this to show the join UI
        packet = Buffer.from([net.SYNC_MESSAGE]).toString('base64');
        ws.send(packet);
    }
    onEnd(ws, code, reason) {
        if (ws.tank) {
            const playerName = ws.nick || ws.tank.name || 'Unknown';
            const teamName = getTeamName(ws.tank.team);
            // Log the code BOTH ends saw. The browser reporting 1006 only says no close frame reached
            // IT; pairing that with what arrived here separates "the transport was severed underneath
            // both of us" (1006 here too) from "one side closed and the other never heard" (anything
            // else) — which is the difference between a platform/network fault and one of ours.
            console.log(`[PLAYER DISCONNECT] Player "${playerName}" disconnected (was on team ${teamName}, ` +
                `tank idx=${ws.tank.idx}) — server saw code=${code}${reason ? ` reason=${reason}` : ''}`);
            // Announce BEFORE destroy() — afterwards the tank is gone and the name with it.
            this.newswire('player_quit', { name: playerName, team: ws.tank.team });
            this.destroy(ws.tank);
            console.log(`[PLAYERS] Total tanks remaining: ${this.tanks.length}`);
        }
        ws.tank = null;
        const idx = this.clients.indexOf(ws);
        if (idx !== -1) {
            this.clients.splice(idx, 1);
        }
        // Pass the reason through in the close frame. Closing bare made every server-side drop look
        // identical to the page — a status-less 1005 — so a player culled by the reaper and a player
        // whose pipe simply broke saw the same "Connection lost" with no way to tell them apart.
        // Only 1000 and the application range 3000-4999 may legally be sent; 1005/1006 arrive on
        // INCOMING closes (where this is already a no-op) and would throw if echoed back.
        const sendable = code === 1000 || (code >= 3000 && code <= 4999);
        if (sendable)
            ws.close(code, reason);
        else
            ws.close();
    }
    onMessage(ws, message) {
        // Convert Buffer to string if needed
        const messageStr = Buffer.isBuffer(message) ? message.toString('utf8') : message;
        // Any inbound message proves the client is alive — reset its silence counter so the
        // stale-client reaper (see sendPackets) never culls an active player.
        ws.heartbeatTimer = 0;
        ws.sinceMessage = 0;
        if (messageStr === '') {
            ws.heartbeatTimer = 0;
        }
        else if (messageStr.charAt(0) === '{') {
            this.onJsonMessage(ws, messageStr);
        }
        else {
            this.onSimpleMessage(ws, messageStr);
        }
    }
    onSimpleMessage(ws, message) {
        const tank = ws.tank;
        if (!tank) {
            return this.onError(ws, new Error('Received a game command from a spectator'));
        }
        const command = message.charAt(0);
        switch (command) {
            case net.START_TURNING_CCW:
                tank.turningCounterClockwise = true;
                break;
            case net.STOP_TURNING_CCW:
                tank.turningCounterClockwise = false;
                break;
            case net.START_TURNING_CW:
                tank.turningClockwise = true;
                break;
            case net.STOP_TURNING_CW:
                tank.turningClockwise = false;
                break;
            case net.START_ACCELERATING:
                tank.accelerating = true;
                break;
            case net.STOP_ACCELERATING:
                tank.accelerating = false;
                break;
            case net.START_BRAKING:
                tank.braking = true;
                break;
            case net.STOP_BRAKING:
                tank.braking = false;
                break;
            case net.START_SHOOTING:
                tank.shooting = true;
                break;
            case net.STOP_SHOOTING:
                tank.shooting = false;
                break;
            case net.START_LAY_MINE:
                tank.layingMine = true;
                break;
            case net.STOP_LAY_MINE:
                tank.layingMine = false;
                break;
            case net.INC_RANGE:
                tank.increaseRange();
                break;
            case net.DEC_RANGE:
                tank.decreaseRange();
                break;
            case net.BUILD_ORDER: {
                const parts = message.slice(2).split(',');
                const action = parts[0];
                const trees = parseInt(parts[1]);
                const x = parseInt(parts[2]);
                const y = parseInt(parts[3]);
                const builder = tank.builder.$;
                if (trees < 0 || !builder.states.actions.hasOwnProperty(action)) {
                    this.onError(ws, new Error('Received invalid build order'));
                }
                else {
                    builder.performOrder(action, trees, this.map.cellAtTile(x, y));
                }
                break;
            }
            default: {
                const sanitized = command.replace(/\W+/g, '');
                this.onError(ws, new Error(`Received an unknown command: ${sanitized}`));
            }
        }
    }
    onJsonMessage(ws, messageStr) {
        let message;
        try {
            message = JSON.parse(messageStr);
            if (typeof message.command !== 'string') {
                throw new Error('Received an invalid JSON message');
            }
        }
        catch (e) {
            return this.onError(ws, e);
        }
        if (message.command === 'join') {
            if (ws.tank) {
                this.onError(ws, new Error('Client tried to join twice.'));
            }
            else {
                this.onJoinMessage(ws, message);
            }
            return;
        }
        const tank = ws.tank;
        if (!tank) {
            return this.onError(ws, new Error('Received a JSON message from a spectator'));
        }
        switch (message.command) {
            case 'msg':
                this.onTextMessage(ws, tank, message);
                break;
            case 'teamMsg':
                this.onTeamTextMessage(ws, tank, message);
                break;
            default: {
                const sanitized = message.command.slice(0, 10).replace(/\W+/g, '');
                this.onError(ws, new Error(`Received an unknown JSON command: ${sanitized}`));
            }
        }
    }
    /**
     * Creates a tank for a connection and synchronizes it to everyone. Then tells the connection
     * that this new tank is his.
     */
    onJoinMessage(ws, message) {
        // These return now. Without it an invalid nick was only logged, and the join went ahead
        // anyway — spawning a tank named `undefined`.
        if (typeof message.nick !== 'string' || message.nick.length > 20) {
            return this.onError(ws, new Error('Client specified invalid nickname.'));
        }
        if (typeof message.team !== 'number' || message.team < 0 || message.team > 5) {
            return this.onError(ws, new Error('Client specified invalid team.'));
        }
        // The name is stored trimmed, so the comparison and the name everyone sees are the same
        // string. The client already refuses an empty field; this covers a hand-made message.
        const nick = normalizeNick(message.nick);
        if (!nick) {
            return this.onError(ws, new Error('Client specified an empty nickname.'));
        }
        // One name to a game — see src/nick.ts for what counts as the same name, and why a player
        // reconnecting inside the reaper's window is refused their own name rather than handed it.
        if (isNickTaken(this.tanks, nick)) {
            console.log(`[JOIN REJECTED] "${nick}" is already in use — asking the client for another name.`);
            ws.send(JSON.stringify({ command: 'joinRejected', reason: 'nickTaken', nick }));
            return;
        }
        ws.tank = this.spawn(Tank, message.team);
        ws.tank.name = nick;
        ws.nick = nick;
        // Log player join with details
        const teamName = getTeamName(message.team);
        console.log(`[PLAYER JOIN] Player "${nick}" joined team ${teamName} (tank idx=${ws.tank.idx}, tank_idx=${ws.tank.tank_idx})`);
        console.log(`[PLAYERS] Total tanks in game: ${this.tanks.length}`);
        console.log(`[PLAYERS] Connected players: ${this.tanks.map((t) => `${t.name || 'Unknown'} (team=${getTeamName(t.team)})`).join(', ')}`);
        // Mark client as NOT synchronized yet - sendPackets() will handle initial sync
        ws.synchronized = false;
        ws.needsInitialSync = true;
    }
    onTextMessage(ws, tank, message) {
        if (typeof message.text !== 'string' || message.text.length > 140) {
            this.onError(ws, new Error('Client sent an invalid text message.'));
        }
        this.broadcast(JSON.stringify({
            command: 'msg',
            idx: tank.idx,
            text: message.text,
        }));
    }
    onTeamTextMessage(ws, tank, message) {
        if (typeof message.text !== 'string' || message.text.length > 140) {
            this.onError(ws, new Error('Client sent an invalid text message.'));
        }
        if (tank.team === 255)
            return;
        const out = JSON.stringify({
            command: 'teamMsg',
            idx: tank.idx,
            text: message.text,
        });
        for (const client of this.clients) {
            if (client.tank.team === tank.team) {
                client.send(out);
            }
        }
    }
    onError(ws, error) {
        console.error('WebSocket error:', error.message);
        // Optionally close the connection
        // ws.close();
    }
    // Helpers
    /**
     * Simple helper to send a message to everyone (only synchronized clients).
     */
    broadcast(message) {
        for (const client of this.clients) {
            if (client.synchronized) {
                client.send(message);
            }
        }
    }
    /**
     * Announce a game event on the newswire. Called only from authority code — game objects gate
     * every emission on `this.world.authority`, because world_pillbox.update() and
     * world_base.findSubject() also run on the network client for prediction, and netRestore()
     * can roll object state back but cannot un-print a ticker line.
     *
     * The line is formatted here, once, into coloured segments; the team on each segment is the
     * value at the moment the event fired and is never re-derived on the client.
     *
     * Strictly live: nothing is retained for replay. A backlog handed to a syncing client was
     * tried and removed — a player walking into a game watched five things that had already
     * happened scroll past as though they were happening now, which is worse than an empty strip.
     * The wire reports what is happening, not what happened.
     */
    newswire(kind, actor, other, places) {
        this.broadcast(JSON.stringify(newswireMessage(kind, actor, other, places)));
    }
    // ── Team discovered map (overview) ─────────────────────────────────────────
    /**
     * Widen each team's discovered map by what its living tanks can see this tick, and note
     * the newly discovered tiles so they can be sent out as a delta. Vision is shared across
     * a team, so one tank scouting reveals the ground for every team mate, present or not
     * yet connected.
     */
    updateTeamDiscovered() {
        const r = (OVERVIEW_SIGHT_TILES - 1) / 2;
        for (const tank of this.tanks) {
            if (!tank || tank.armour === 255 || tank.x == null || tank.y == null)
                continue;
            const team = tank.team;
            if (typeof team !== 'number' || team < 0 || team > 5)
                continue;
            let discovered = this.teamDiscovered[team];
            if (!discovered) {
                discovered = this.teamDiscovered[team] = new Uint8Array(MAP_SIZE_TILES * MAP_SIZE_TILES);
                this.teamDiscoveredPending[team] = [];
            }
            const pending = this.teamDiscoveredPending[team];
            const tx = Math.floor(tank.x / TILE_SIZE_WORLD);
            const ty = Math.floor(tank.y / TILE_SIZE_WORLD);
            const sx = Math.max(0, tx - r);
            const sy = Math.max(0, ty - r);
            const ex = Math.min(MAP_SIZE_TILES - 1, tx + r);
            const ey = Math.min(MAP_SIZE_TILES - 1, ty + r);
            for (let y = sy; y <= ey; y++) {
                const row = y * MAP_SIZE_TILES;
                for (let x = sx; x <= ex; x++) {
                    const idx = row + x;
                    if (discovered[idx] === 0) {
                        discovered[idx] = 1;
                        pending.push(idx);
                    }
                }
            }
        }
    }
    /**
     * A team's whole discovered map, packed one bit per tile and base64'd — about 11kB, sent
     * once when a client synchronizes. Null when that team has never had a tank.
     */
    teamDiscoveredSnapshot(team) {
        const discovered = this.teamDiscovered[team];
        if (!discovered)
            return null;
        const packed = Buffer.alloc(discovered.length / 8);
        for (let i = 0; i < discovered.length; i++) {
            if (discovered[i])
                packed[i >> 3] |= 1 << (i & 7);
        }
        return packed.toString('base64');
    }
    /**
     * We send critical updates every frame, and non-critical updates every other frame. On top of
     * that, non-critical updates may be dropped, if the client's hearbeats are interrupted.
     */
    sendPackets() {
        // ── Team discovered map ────────────────────────────────────────────────
        // Accumulate every tick (cheap: one 15x15 box per living tank), but only ship deltas
        // twice a second — a tank crosses far less than a sight box in that time, so nothing
        // is missed and the message rate stays low.
        this.updateTeamDiscovered();
        const DISCOVERED_SEND_TICKS = 25; // ~0.5s at 20ms/tick
        const discoveredPackets = [];
        if (++this.teamDiscoveredTick >= DISCOVERED_SEND_TICKS) {
            this.teamDiscoveredTick = 0;
            for (let team = 0; team < this.teamDiscoveredPending.length; team++) {
                const pending = this.teamDiscoveredPending[team];
                if (!pending || pending.length === 0)
                    continue;
                discoveredPackets[team] = JSON.stringify({ command: 'discovered', add: pending });
                this.teamDiscoveredPending[team] = [];
            }
        }
        // ── Liveness ping ──────────────────────────────────────────────────────
        // Ping each client about once a second. The pong handler (onConnect) resets
        // heartbeatTimer, so liveness no longer depends on the client's throttleable timers.
        const PING_TICKS = 50; // ~1s at 20ms/tick
        for (const client of this.clients) {
            if (++client.pingTimer >= PING_TICKS) {
                client.pingTimer = 0;
                try {
                    client.ping();
                }
                catch {
                    // Socket already closing — the reaper and the close handler deal with it.
                }
            }
        }
        // ── Stale-client reaper ────────────────────────────────────────────────
        // heartbeatTimer counts ticks since a client's last sign of life (any message, or a
        // pong), so a timer past REAP_TICKS means the socket dropped uncleanly (e.g. a browser
        // refresh that never fired a `close` event). Without this, that client's tank lingers
        // in this.world.tanks as a GHOST — phantom tanks of stale teams re-claim bases every
        // tick and the base team FLICKERS. Reap through the normal onEnd → destroy path so a
        // future unclean drop self-cleans. Iterate a copy because onEnd splices this.clients.
        // Sized against how long a real browser goes quiet, not against how fast we could notice.
        // Chrome freezes a backgrounded window outright: measured here, one spent 10s, 30s and 9s
        // stretches frozen back to back, with its app-level heartbeat dead for up to 28s at a time —
        // the page cannot send anything while its main thread is stopped. The old 250 (~5s, and ~6.5s
        // at the tick rate we actually run) sat well inside that, leaving a backgrounded player alive
        // only for as long as the protocol pong kept answering on its behalf. Lose a handful of
        // consecutive pongs — a slow machine, a busy tab, a proxy, real network jitter — and a player
        // who is merely in a background window gets culled mid-game.
        //
        // The cost of going long is a ghost tank lingering after an UNCLEAN drop (a clean close still
        // reaps instantly via the close handler), so bases can flicker for that window. A rare 30s
        // flicker is a far better trade than routinely kicking live players.
        const REAP_TICKS = 1500; // ~30s+ — longer than any freeze we have measured
        const WARN_TICKS = 120; // must exceed one PING_TICKS cycle (50) plus jitter, or this fires
        // on entirely healthy clients whose sincePong is mid-sawtooth
        for (const client of [...this.clients]) {
            if (!client.tank)
                continue;
            // Onset marker. A reap tells us a client went quiet; this tells us WHEN it started and
            // which signal failed first, which is the difference between "the browser stopped
            // draining the socket" and "the return path through the proxy broke".
            if (client.heartbeatTimer > WARN_TICKS && !client.silenceWarned) {
                client.silenceWarned = true;
                console.log(`[SILENCE] tank idx=${client.tank.idx} quiet ${client.heartbeatTimer}t ` +
                    `(msg ${client.sinceMessage}t ago, pong ${client.sincePong}t ago, ` +
                    `buffered=${client.bufferedAmount}, readyState=${client.readyState})`);
            }
            else if (client.heartbeatTimer <= WARN_TICKS && client.silenceWarned) {
                console.log(`[SILENCE] tank idx=${client.tank.idx} recovered.`);
                client.silenceWarned = false;
            }
            if (client.heartbeatTimer > REAP_TICKS) {
                // bufferedAmount is the giveaway: a large server→client backlog means the far end
                // stopped READING (renderer stalled / pipe wedged), whereas ~0 with unanswered pings
                // means the socket drains fine and only the return path is dead.
                console.log(`[REAP] Stale client (tank idx=${client.tank.idx}, silent ${client.heartbeatTimer} ticks) — removing ghost tank.`);
                console.log(`[REAP]   lastMessage=${client.sinceMessage}t lastPong=${client.sincePong}t ` +
                    `bufferedAmount=${client.bufferedAmount} readyState=${client.readyState}`);
                this.onEnd(client, 4000, 'heartbeat timeout');
            }
        }
        // Check if any clients need initial sync
        const newClients = this.clients.filter(c => c.needsInitialSync);
        const hasNewClients = newClients.length > 0;
        // Toggle oddTick normally (don't force it for new clients)
        this.oddTick = !this.oddTick;
        // Create packets for existing clients
        let smallPacket;
        let largePacket;
        if (this.oddTick) {
            smallPacket = this.changesPacket(true);
            smallPacket = Buffer.from(smallPacket).toString('base64');
            largePacket = smallPacket;
        }
        else {
            smallPacket = this.changesPacket(false);
            largePacket = smallPacket.concat(this.updatePacket());
            smallPacket = Buffer.from(smallPacket).toString('base64');
            largePacket = Buffer.from(largePacket).toString('base64');
        }
        // For new clients, create a separate full sync packet
        let newClientPacket;
        if (hasNewClients) {
            // Create full snapshot of all objects for new clients
            const savedChanges = this.changes;
            this.changes = [];
            for (let i = 0; i < this.objects.length; i++) {
                const obj = this.objects[i];
                if (obj) {
                    // Use obj.idx (not array index) to match the server's object index
                    this.changes.push(['create', obj, obj.idx]);
                }
                else {
                    // Send DESTROY for null slots so the client clears any ghost objects
                    // that were captured in the initial onConnect sync but have since been
                    // destroyed (e.g. shells/explosions/fireballs that expired).
                    this.changes.push(['destroy', null, i]);
                }
            }
            newClientPacket = this.changesPacket(true, true); // Pass isInitialSync=true
            this.changes = savedChanges; // Restore changes for existing clients
            newClientPacket = Buffer.from(newClientPacket).toString('base64');
        }
        // Calculate and send team scores every 25 ticks (once per second)
        this.teamScoresTick++;
        let teamScoresPacket = null;
        if (this.teamScoresTick >= 25) {
            this.teamScoresTick = 0;
            const scores = this.calculateTeamScores();
            // Announce every change of position, not just at the top. Only the sides fielding tanks
            // are ranked — an empty team sliding down the table is news about nobody — and
            // updateStandings() applies the hysteresis, so this fires on real swings only. See
            // NEWSWIRE_POSITION_MARGIN.
            const fielded = new Set();
            for (const tank of this.tanks) {
                if (tank.team >= 0 && tank.team <= 5)
                    fielded.add(tank.team);
            }
            const standings = updateStandings(scores, fielded, this.standings);
            this.standings = standings.order;
            if (standings.leader !== null && standings.leader !== this.leadTeam) {
                const previous = this.leadTeam;
                this.leadTeam = standings.leader;
                // A rebaseline moved the title by roster change, not by play — take the new leader as
                // read so the next real overtake is announced against the truth, but say nothing now.
                if (!standings.rebaselined) {
                    this.newswire('lead_change', teamActor(standings.leader), previous === null ? null : teamActor(previous));
                }
            }
            for (const swap of standings.swaps) {
                // First place is the lead_change line above, which already names both parties.
                if (swap.riserPlace === 1)
                    continue;
                this.newswire('position_change', teamActor(swap.riser), swap.faller === null ? null : teamActor(swap.faller), [swap.riserPlace, swap.fallerPlace ?? 0]);
            }
            // Record team scores to Firebase for stats
            statsService.recordTeamScores(scores).catch((error) => {
                // Silent fail - don't crash the game if stats recording fails
                console.error('Failed to record team scores:', error);
            });
            // Convert scores to uint16 (multiply by 100 for 2 decimal places precision)
            const packedScores = pack('HHHHHH', Math.round(scores[0] * 100), Math.round(scores[1] * 100), Math.round(scores[2] * 100), Math.round(scores[3] * 100), Math.round(scores[4] * 100), Math.round(scores[5] * 100));
            const teamScoresData = [net.TEAMSCORES_MESSAGE].concat(packedScores);
            teamScoresPacket = Buffer.from(teamScoresData).toString('base64');
        }
        // Send packets to all clients
        for (const client of this.clients) {
            // Handle initial sync for new clients
            if (client.needsInitialSync) {
                // Send full snapshot
                client.send(newClientPacket);
                // Replay terrain changes that occurred between this client's connect-time map.dump and
                // now. The dump was the client's ONLY terrain snapshot and mapChange deltas do not start
                // flowing until it is synchronized — so without this replay, every forest harvest / wall
                // build / crater during the join window stays stale on the client (phantom terrain).
                // Serialize the buffered mapChanges through changesPacket by briefly borrowing this.changes
                // (same save/restore pattern used for newClientPacket above), then deliver as MAPCHANGE msgs.
                const catchupCount = client.catchupChanges ? client.catchupChanges.length : -1;
                if (client.catchupChanges && client.catchupChanges.length) {
                    const savedForCatchup = this.changes;
                    this.changes = client.catchupChanges;
                    const catchupData = this.changesPacket(false);
                    this.changes = savedForCatchup;
                    if (catchupData.length) {
                        client.send(Buffer.from(catchupData).toString('base64'));
                    }
                }
                // Log only meaningful outcomes: N>0 = terrain deltas from the [connect→sync] window were
                // replayed (the gap that used to leave stale/phantom terrain), or -1 = buffer was never
                // initialized (onConnect didn't run for this client → a regression worth seeing). The
                // common N=0 (window caught nothing) is silent to avoid per-join noise.
                if (catchupCount !== 0) {
                    console.log(`[CATCHUP] sync tank idx=${client.tank?.idx}: replayed ${catchupCount} terrain change(s) from the [connect→sync] window (overflow=${!!client.catchupOverflow}).`);
                }
                client.catchupChanges = null;
                // Send welcome packet
                const welcomePacket = Buffer.from(pack('BH', net.WELCOME_MESSAGE, client.tank.idx)).toString('base64');
                client.send(welcomePacket);
                // Re-send EVERY current tank's nick now that this client holds the full object
                // snapshot (newClientPacket above). The onConnect dump only covered tanks that
                // existed at connect time, and the per-join nick broadcast skips clients that aren't
                // yet `synchronized` — so a tank that joined while THIS client was syncing would
                // otherwise never get a name here (its label never appears). Dumping the full list at
                // the sync boundary closes that race for good; every tank object already exists, so
                // the client applies each nick immediately (no buffering needed).
                const nickMessages = this.tanks
                    .filter((t) => t.name)
                    .map((t) => ({ command: 'nick', idx: t.idx, nick: t.name }));
                if (nickMessages.length)
                    client.send(JSON.stringify(nickMessages));
                // Hand over the team's discovered map for the overview. This is the whole point of
                // keeping it server-side: everything the team explored before this client existed.
                const discoveredSnapshot = this.teamDiscoveredSnapshot(client.tank.team);
                if (discoveredSnapshot) {
                    client.send(JSON.stringify({ command: 'discovered', mask: discoveredSnapshot }));
                }
                // Mark as synchronized
                client.synchronized = true;
                client.needsInitialSync = false;
                client.justSynchronized = true; // Skip packets next tick (already have everything)
                continue;
            }
            // Send regular updates to synchronized clients
            if (!client.synchronized)
                continue;
            // On the tick after initial sync, skip the UPDATE (already sent everything) but still
            // deliver the changes-only smallPacket. This ensures DESTROY_MESSAGE for any objects
            // that die on this tick reach the client — otherwise they become persistent ghost
            // objects that cause "Message length mismatch" over-reads on every subsequent UPDATE.
            if (client.justSynchronized) {
                client.justSynchronized = false;
                client.send(smallPacket); // Changes (CREATE/DESTROY) but no UPDATE
                if (teamScoresPacket)
                    client.send(teamScoresPacket);
                continue;
            }
            if (client.heartbeatTimer > 40) {
                client.send(smallPacket);
                client.heartbeatTimer++; // keep climbing so the stale-client reaper can fire
            }
            else {
                client.send(largePacket);
                client.heartbeatTimer++;
            }
            client.sinceMessage++;
            client.sincePong++;
            // Send team scores if calculated this tick
            if (teamScoresPacket) {
                client.send(teamScoresPacket);
            }
            // Send this team's newly discovered tiles, if any were batched this tick.
            const discoveredPacket = client.tank ? discoveredPackets[client.tank.team] : null;
            if (discoveredPacket) {
                client.send(discoveredPacket);
            }
        }
        // Now broadcast nicks for new clients AFTER all packets have been sent
        // This ensures the CREATE messages arrive before the nick commands
        for (const client of newClients) {
            this.broadcast(JSON.stringify({
                command: 'nick',
                idx: client.tank.idx,
                nick: client.nick,
            }));
            // Announce the join from here, not from onJoinMessage(): that sets `synchronized = false`
            // and broadcast() skips unsynchronized clients, so announcing there means the joiner is
            // the one player who never sees their own line.
            this.newswire('player_join', { name: client.nick || client.tank.name, team: client.tank.team });
        }
        // Clear newlyCreated AFTER packets have been sent
        // Objects created in this tick have been sent via CREATE+TINY_UPDATE and excluded from UPDATE
        // In the next tick, they should be included in UPDATE packets
        this.newlyCreated.clear();
    }
    /**
     * Get a data stream for critical updates. The optional `fullCreate` flag is used to transmit
     * create messages that include state, which is needed when not followed by an update packet.
     * The `isInitialSync` flag indicates we're building a full sync for a new client, so we should
     * not add objects to newlyCreated.
     */
    changesPacket(fullCreate, isInitialSync = false) {
        if (this.changes.length === 0)
            return [];
        let data = [];
        const needUpdate = [];
        for (const change of this.changes) {
            // Don't mutate the change tuple - destructure without modifying
            const [type, obj, idx] = change;
            switch (type) {
                case 'create': {
                    // Skip null objects - they're just placeholders to preserve indices
                    if (!obj)
                        break;
                    // Always send TINY_UPDATE after CREATE to initialize object state
                    needUpdate.push(obj);
                    // Only add to newlyCreated if this is a real creation (not initial sync)
                    if (!isInitialSync) {
                        this.newlyCreated.add(obj); // Mark as newly created in instance variable
                    }
                    // Send both type index and object index so client can maintain sparse array structure
                    data = data.concat([net.CREATE_MESSAGE], pack('BH', obj._net_type_idx, idx));
                    break;
                }
                case 'destroy': {
                    for (let i = 0; i < needUpdate.length; i++) {
                        if (needUpdate[i] === obj) {
                            needUpdate.splice(i, 1);
                            break;
                        }
                    }
                    data = data.concat([net.DESTROY_MESSAGE], pack('H', idx));
                    break;
                }
                case 'mapChange': {
                    const x = change[1], y = change[2], ascii = change[3], life = change[4], mine = change[5];
                    const asciiCode = ascii.charCodeAt(0);
                    const packed = pack('BBBBf', x, y, asciiCode, life, mine);
                    data = data.concat([net.MAPCHANGE_MESSAGE], packed);
                    break;
                }
                case 'soundEffect': {
                    const sfx = change[1], x = change[2], y = change[3], ownerIdx = change[4];
                    data = data.concat([net.SOUNDEFFECT_MESSAGE], pack('BHHH', sfx, x, y, ownerIdx));
                    break;
                }
            }
        }
        for (const obj of needUpdate) {
            // CRITICAL FIX: Newly created objects must ALWAYS use isCreate=true for TINY_UPDATE
            // because the client sets isCreate=true based on _createdViaMessage flag
            // If we send isCreate=false but client expects isCreate=true, byte counts won't match!
            const useFullCreate = fullCreate || this.newlyCreated.has(obj);
            const objData = this.dump(obj, useFullCreate);
            data = data.concat([net.TINY_UPDATE_MESSAGE], pack('H', obj.idx), objData);
        }
        // Clear changes array so they don't get re-broadcast
        this.changes = [];
        return data;
    }
    /**
     * Get a data stream for non-critical updates.
     */
    updatePacket() {
        return [net.UPDATE_MESSAGE].concat(this.dumpTick(false, this.newlyCreated));
    }
}
helpers.extend(BoloServerWorld.prototype, BoloWorldMixin);
allObjects.registerWithWorld(BoloServerWorld.prototype);
export class Application {
    constructor(options = {}) {
        this.games = {};
        this.ircClients = [];
        this.tickCounter = 0;
        this.options = options;
        // When running with tsx, __filename is src/server/application.ts, so ../../ goes to project root
        const webroot = path.join(path.dirname(fs.realpathSync(__filename)), '../../');
        this.connectServer = connect();
        if (this.options.web?.log) {
            // Modern connect doesn't have logger middleware by default.
            //
            // High-frequency debug endpoints are excluded. A hosted log is a fixed-size window, not an
            // archive: brain-state is POSTed several times a SECOND by every brain client, which pushed
            // the retrievable history down to about six minutes and buried the disconnect diagnostics
            // we actually needed. Anything logged once per tick is not worth the log it displaces.
            const NOISY = /^\/api\/(brain-state|client-error)\b/;
            this.connectServer.use('/', (req, res, next) => {
                if (!NOISY.test(req.url ?? ''))
                    console.log(`${req.method} ${req.url}`);
                next();
            });
        }
        this.connectServer.use('/', redirector(this.options.general?.base || ''));
        this.games = {};
        this.ircClients = [];
        const mapPath = path.join(path.dirname(fs.realpathSync(__filename)), '../../maps');
        this.maps = new MapIndex(mapPath, () => {
            this.resetDemo((err) => {
                if (err)
                    console.log(err);
            });
        });
        // API endpoints for lobby (after this.games and this.maps are initialized)
        this.connectServer.use('/api/maps', (req, res) => {
            try {
                res.setHeader('Content-Type', 'application/json');
                if (!this.maps || !this.maps.nameIndex) {
                    console.error('[API ERROR] Maps not initialized yet');
                    res.statusCode = 503;
                    res.end(JSON.stringify({ error: 'Maps are still being loaded' }));
                    return;
                }
                const mapList = Object.keys(this.maps.nameIndex).map(name => ({
                    name,
                    path: this.maps.nameIndex[name].path
                }));
                res.end(JSON.stringify(mapList));
            }
            catch (error) {
                console.error('[API ERROR] /api/maps failed:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', message: String(error) }));
            }
        });
        // Brain state dump sink (debug). The AI brain runs client-side and can't write files, so it
        // POSTs a structured per-tick snapshot here and we append it as JSONL to a file a shell/watcher
        // can tail — giving offline analysis the TRUE world the brain sees, not the one-line HUD.
        // GET ?clear=1 truncates the file (start a fresh capture).
        this.connectServer.use('/api/brain-state', (req, res) => {
            const FILE = '/tmp/bolo-brain-state.jsonl';
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => { body += chunk; if (body.length > 1000000)
                    req.destroy(); });
                req.on('end', () => {
                    try {
                        fs.appendFile(FILE, body.replace(/\n/g, ' ').trim() + '\n', () => { });
                        res.end('{"ok":true}');
                    }
                    catch (error) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: String(error) }));
                    }
                });
            }
            else if (req.method === 'GET' && /[?&]clear=1/.test(req.url ?? '')) {
                fs.writeFile(FILE, '', () => { });
                res.end('{"ok":true,"cleared":true}');
            }
            else {
                res.end('{"ok":true,"hint":"POST a JSON snapshot (appended to ' + FILE + '); GET ?clear=1 to reset"}');
            }
        });
        // Client-error sink. A player who drops mid-game can't be asked to screenshot their console,
        // and on a hosted deployment there is no console to read at all — so the page reports its own
        // uncaught errors, unhandled rejections, main-thread stalls and socket close codes here, and
        // they land in the SERVER log next to the [REAP]/[SILENCE] lines for the same moment.
        this.connectServer.use('/api/client-error', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method !== 'POST') {
                res.end('{"ok":true,"hint":"POST a JSON client error report"}');
                return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; if (body.length > 100000)
                req.destroy(); });
            req.on('end', () => {
                let report = null;
                try {
                    report = JSON.parse(body);
                }
                catch { /* logged raw below */ }
                const r = report ?? { kind: 'unparseable', raw: body.slice(0, 2000) };
                console.log(`[CLIENT ${String(r.kind ?? 'error').toUpperCase()}] ${r.nick ?? '?'}: ${r.message ?? ''}`);
                if (r.detail)
                    console.log(`[CLIENT]   ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}`);
                if (r.stack)
                    console.log(`[CLIENT]   ${String(r.stack).split('\n').slice(0, 6).join('\n[CLIENT]   ')}`);
                fs.appendFile('/tmp/bolo-client-errors.jsonl', JSON.stringify({ ts: Date.now(), ...r }).replace(/\n/g, ' ') + '\n', () => { });
                res.end('{"ok":true}');
            });
        });
        this.connectServer.use('/api/games', (req, res) => {
            if (req.method === 'GET') {
                // List active games
                try {
                    res.setHeader('Content-Type', 'application/json');
                    if (!this.games) {
                        console.error('[API ERROR] Games object not initialized');
                        res.statusCode = 503;
                        res.end(JSON.stringify({ error: 'Server not ready' }));
                        return;
                    }
                    const gameList = Object.keys(this.games).map(gid => ({
                        gid,
                        url: this.games[gid].url,
                        mapName: this.games[gid].map.name || 'Unknown',
                        playerCount: this.games[gid].tanks.length
                    }));
                    res.end(JSON.stringify(gameList));
                }
                catch (error) {
                    console.error('[API ERROR] /api/games GET failed:', error);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Internal server error', message: String(error) }));
                }
            }
            else if (req.method === 'POST') {
                // Create new game with specified map
                let body = '';
                req.on('data', (chunk) => body += chunk);
                req.on('end', () => {
                    try {
                        const { mapName, gameMode } = JSON.parse(body);
                        const mapDescriptor = this.maps.get(mapName);
                        if (!mapDescriptor) {
                            res.statusCode = 404;
                            res.end(JSON.stringify({ error: 'Map not found' }));
                            return;
                        }
                        if (!this.haveOpenSlots()) {
                            res.statusCode = 503;
                            res.end(JSON.stringify({ error: 'Server full' }));
                            return;
                        }
                        fs.readFile(mapDescriptor.path, (err, data) => {
                            if (err) {
                                res.statusCode = 500;
                                res.end(JSON.stringify({ error: 'Failed to load map' }));
                                return;
                            }
                            try {
                                const game = this.createGame(data, gameMode);
                                game.map.name = mapName; // Store map name for reference
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({
                                    gid: game.gid,
                                    url: game.url,
                                    mapName,
                                    playerCount: 0
                                }));
                            }
                            catch (mapError) {
                                console.error(`[MAP ERROR] Failed to parse map '${mapName}':`, mapError.message);
                                res.statusCode = 400;
                                res.end(JSON.stringify({ error: `Map parsing failed: ${mapError.message}` }));
                            }
                        });
                    }
                    catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Invalid request' }));
                    }
                });
            }
            else {
                res.statusCode = 405;
                res.end('Method not allowed');
            }
        });
        // API endpoint for team ranking stats (real Firebase data)
        this.connectServer.use('/api/stats/rankings', async (req, res) => {
            try {
                const urlParts = url.parse(req.url, true);
                const period = urlParts.query.period || 'day';
                res.setHeader('Content-Type', 'application/json');
                // Validate period parameter
                if (!['hour', 'day', 'week', 'month', 'year'].includes(period)) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid period. Use: hour, day, week, month, or year' }));
                    return;
                }
                // Fetch data from Firebase
                const data = await firebaseService.getStatsForPeriod(period);
                res.end(JSON.stringify({ period, data }));
            }
            catch (error) {
                console.error('[API ERROR] /api/stats/rankings failed:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', message: String(error) }));
            }
        });
        // Serve built client files (index.html and assets)
        this.connectServer.use('/', serveStatic(path.join(webroot, 'dist/client')));
        // Serve static assets (images, sounds, css, maps) from root
        this.connectServer.use('/', serveStatic(webroot));
        this.loop = createLoop({
            rate: TICK_LENGTH_MS,
            tick: () => this.tick(),
        });
    }
    // FIXME: this is for the demo
    resetDemo(cb) {
        if (this.demo) {
            this.closeGame(this.demo);
        }
        const everard = this.maps.get('Everard Island');
        if (!everard) {
            return cb?.('Could not find Everard Island.');
        }
        fs.readFile(everard.path, (err, data) => {
            if (err) {
                return cb?.(`Unable to start demo game: ${err.toString()}`);
            }
            this.demo = this.createGame(data);
            this.demo.map.name = 'Everard Island'; // Store map name for reference
            cb?.(null);
        });
    }
    haveOpenSlots() {
        return Object.getOwnPropertyNames(this.games).length < this.options.general.maxgames;
    }
    createGameId() {
        const charset = 'abcdefghijklmnopqrstuvwxyz';
        let gid;
        while (true) {
            const chars = [];
            for (let i = 0; i < 20; i++) {
                chars.push(charset.charAt(mathRound(mathRandom() * (charset.length - 1))));
            }
            gid = chars.join('');
            if (!this.games.hasOwnProperty(gid))
                break;
        }
        return gid;
    }
    createGame(mapData, gameMode = 'open') {
        const map = WorldMap.load(mapData);
        const gid = this.createGameId();
        const game = new BoloServerWorld(map);
        this.games[gid] = game;
        game.gid = gid;
        game.url = `${this.options.general.base}/match/${gid}`;
        game.gameMode = (gameMode === 'tournament' || gameMode === 'strict') ? gameMode : 'open';
        console.log(`Created game '${gid}' (mode: ${game.gameMode})`);
        this.startLoop();
        return game;
    }
    closeGame(game) {
        delete this.games[game.gid];
        this.possiblyStopLoop();
        game.close();
        console.log(`Closed game '${game.gid}'`);
    }
    registerIrcClient(irc) {
        this.ircClients.push(irc);
    }
    listen(...args) {
        this.httpServer = this.connectServer.listen.apply(this.connectServer, args);
        // Setup WebSocket server
        const wss = new WebSocketServer({ noServer: true });
        this.httpServer.on('upgrade', (request, socket, head) => {
            const pathname = request.url || '/';
            const handler = this.getSocketPathHandler(pathname);
            if (handler === false) {
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                handler(ws);
            });
        });
    }
    shutdown() {
        for (const client of this.ircClients) {
            client.shutdown();
        }
        for (const [gid, game] of Object.entries(this.games)) {
            game.close();
        }
        this.loop.stop();
        this.httpServer.close();
    }
    // Loop control
    startLoop() {
        this.loop.start();
    }
    possiblyStopLoop() {
        // Never stop the loop - we need it running to perform cleanup checks on empty games
        // The loop will continue as long as there are games (including the demo game)
    }
    tick() {
        for (const [gid, game] of Object.entries(this.games)) {
            game.tick();
        }
        // Periodically check for empty games and close them (check every ~16 seconds)
        this.tickCounter++;
        if (this.tickCounter % 1000 === 0) {
            const now = Date.now();
            const ONE_HOUR_MS = 60 * 60 * 1000;
            for (const [gid, game] of Object.entries(this.games)) {
                // Skip the demo game - never close it
                if (game === this.demo) {
                    continue;
                }
                // Emptiness is measured HERE, from the live tank count, rather than trusted from a field
                // set once when the game was constructed. It used to be the latter: emptyStartTime was
                // stamped in the constructor and never written again, so the check below was really
                // "was this game created over an hour ago" — and a busy game full of players got closed
                // out from under them on its first birthday, dropping everyone at once.
                if (game.tanks.length > 0) {
                    game.emptyStartTime = null;
                    continue;
                }
                if (game.emptyStartTime === null || game.emptyStartTime === undefined) {
                    game.emptyStartTime = now; // just became empty — start the clock
                    continue;
                }
                // Check if game has been empty for over an hour
                if ((now - game.emptyStartTime) > ONE_HOUR_MS) {
                    console.log(`Closing empty game '${gid}' (empty for ${Math.floor((now - game.emptyStartTime) / 1000 / 60)} minutes)`);
                    this.closeGame(game);
                }
            }
        }
    }
    // WebSocket handling
    /**
     * Determine what will handle a WebSocket's 'connect' event, based on the requested resource.
     */
    getSocketPathHandler(pathname) {
        // FIXME: Simple lobby with chat and match making.
        if (pathname === '/lobby')
            return false;
        // FIXME: Match joining based on a UUID.
        const matchRegex = /^\/match\/([a-z]{20})$/;
        const m = matchRegex.exec(pathname);
        if (m) {
            if (this.games.hasOwnProperty(m[1])) {
                return (ws) => this.games[m[1]].onConnect(ws);
            }
            else {
                return false;
            }
        }
        // FIXME: This is the temporary entry point.
        if (pathname === '/demo' && this.demo) {
            return (ws) => this.demo.onConnect(ws);
        }
        return false;
    }
}
// Entry point
/**
 * Helper middleware to redirect from '/match/*'.
 */
function redirector(base) {
    return (req, res, next) => {
        const m = /^\/match\/([a-z]{20})$/.exec(req.url);
        if (m) {
            const query = `?${m[1]}`;
            res.writeHead(301, { Location: `${base}/${query}` });
            res.end();
        }
        else {
            next();
        }
    };
}
/**
 * Don't export a server directly, but this factory function. Once called, the timer loop will
 * start. I believe it's untidy to have timer loops start after a simple require().
 */
function createBoloApp(options) {
    // Initialize Firebase for team stats (if configured)
    const initializeFirebase = async () => {
        try {
            // Determine hostname (localhost for dev, production domain for prod)
            const hostname = options.web?.hostname || 'localhost';
            // Firebase service account path (optional - uses GOOGLE_APPLICATION_CREDENTIALS if not provided)
            const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json';
            // Try to initialize Firebase
            await firebaseService.initialize(hostname, serviceAccountPath);
            // Start aggregation jobs
            statsService.startAllJobs();
            console.log('Firebase Team Stats system initialized successfully');
        }
        catch (error) {
            // Firebase not configured - continue without stats
            console.log('Firebase not configured - Team Stats will use mock data only');
            console.log('To enable real stats, set up Firebase and provide credentials');
        }
    };
    // Initialize Firebase async (don't block server startup)
    initializeFirebase();
    return new Application(options);
}
export default createBoloApp;
//# sourceMappingURL=application.js.map