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
import * as http from 'http';
import { WebSocketServer } from 'ws';
import { MapIndex } from './map_index';
import * as helpers from '../helpers';
import BoloWorldMixin, { BoloWorldMixin as BoloWorldMixinInterface } from '../world_mixin';
import * as allObjectsModule from '../objects/all';
import { Tank } from '../objects/tank';
import WorldMap from '../world_map';
import * as net from '../net';
import { TICK_LENGTH_MS } from '../constants';
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
function getTeamName(team: number): string {
  const teamNames = ['RED', 'BLUE', 'YELLOW', 'GREEN', 'ORANGE', 'PURPLE'];
  return teamNames[team] || 'NEUTRAL';
}

// Server World

export class BoloServerWorld extends ServerWorld implements BoloWorldMixinInterface {
  authority: boolean = true;
  map: any;
  clients: any[] = [];
  oddTick: boolean = false;
  changes: any[] = [];
  newlyCreated: Set<any> = new Set();  // Track objects created this tick
  gid?: string;
  url?: string;
  tanks: any[] = [];
  emptyStartTime: number | null = null;  // Track when game became empty

  // Methods from BoloWorldMixin (applied via helpers.extend at the bottom of the file)
  boloInit!: () => void;
  addTank!: (tank: any) => void;
  removeTank!: (tank: any) => void;
  getAllMapObjects!: () => any[];
  spawnMapObjects!: () => void;
  resolveMapObjectOwners!: () => void;

  constructor(map: any) {
    super();
    this.map = map;
    this.boloInit();
    this.clients = [];
    this.map.world = this;
    this.oddTick = false;
    this.spawnMapObjects();
    this.emptyStartTime = Date.now();  // Game starts empty
  }

  insert(obj: any): void {
    // Insert an already-instantiated object (used for map objects like pillboxes and bases)
    obj.idx = this.objects.length;

    // Set the network type index based on the object's class
    const typeIdx = (this.constructor as typeof ServerWorld).typesByName.get(obj.constructor.name);
    if (typeIdx !== undefined) {
      obj._net_type_idx = typeIdx;
    }

    this.objects.push(obj);
    this.changes.push(['create', obj, obj.idx]);
  }

  close(): void {
    for (const client of this.clients) {
      client.end();
    }
  }

  // Callbacks

  /**
   * Update, and then send packets to the client.
   */
  tick(): void {
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
            if (dx === 0 && dy === 0) continue;
            const neighbor = cell.neigh(dx, dy);
            if (neighbor.isType('#')) forestCount++;
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

    this.sendPackets();
  }

  /**
   * Emit a sound effect from the given location. `owner` is optional.
   */
  soundEffect(sfx: number, x: number, y: number, owner?: any): void {
    const ownerIdx = owner != null ? owner.idx : 65535;
    this.changes.push(['soundEffect', sfx, x, y, ownerIdx]);
  }

  /**
   * Record map changes.
   */
  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {
    const ascii = cell.type.ascii;
    this.changes.push(['mapChange', cell.x, cell.y, ascii, cell.life, cell.mine]);
  }

  // Connection handling

  onConnect(ws: any): void {
    // Set-up the websocket parameters.
    this.clients.push(ws);
    ws.heartbeatTimer = 0;
    ws.synchronized = false;  // Mark client as not yet synchronized
    ws.on('message', (data: any) => this.onMessage(ws, data));
    ws.on('close', (code: number, reason: string) => this.onEnd(ws, code, reason));

    // Send the current map state. We don't send pillboxes and bases, because the client
    // receives create messages for those, and then fills the map structure based on those.
    // The client expects this as a separate message.
    let packet: any = this.map.dump({ noPills: true, noBases: true });
    packet = Buffer.from(packet).toString('base64');
    ws.send(packet);

    // To synchronize the object list to the client, we use changesPacket with fullCreate=true
    // This sends CREATE messages followed by TINY_UPDATE messages for each object
    console.log(`[SERVER] Client connecting, objects count: ${this.objects.length}, non-null: ${this.objects.filter(o => o).length}`);

    // Build a snapshot of all existing objects at this moment, including nulls to preserve indices
    // The client needs to have the same sparse array structure as the server
    const objectsSnapshot = this.objects.map(obj => obj);

    // Replace changes array with snapshot - include nulls to preserve indices
    this.changes = objectsSnapshot.map((obj, idx) =>
      obj ? ['create', obj, idx] as [string, any, number] : ['create', null, idx] as [string, any, number]
    );

    console.log(`[SERVER] Sending initial sync with ${this.changes.filter(c => c[1]).length} non-null objects out of ${this.changes.length} total`);
    let packetData = this.changesPacket(true, true);  // Pass isInitialSync=true for first client
    packet = Buffer.from(packetData).toString('base64');
    ws.send(packet);

    // Don't restore old changes - changesPacket() cleared this.changes
    // Any new changes that happened during packet building will be broadcast on next tick

    // Synchronize all player names.
    const messages = this.tanks.map((tank: any) => ({
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

  onEnd(ws: any, code: number, reason: string): void {
    if (ws.tank) {
      const playerName = ws.nick || ws.tank.name || 'Unknown';
      const teamName = getTeamName(ws.tank.team);
      console.log(`[PLAYER DISCONNECT] Player "${playerName}" disconnected (was on team ${teamName}, tank idx=${ws.tank.idx})`);
      this.destroy(ws.tank);
      console.log(`[PLAYERS] Total tanks remaining: ${this.tanks.length}`);
    }
    ws.tank = null;
    const idx = this.clients.indexOf(ws);
    if (idx !== -1) {
      this.clients.splice(idx, 1);
    }
    ws.close();
  }

  onMessage(ws: any, message: any): void {
    // Convert Buffer to string if needed
    const messageStr = Buffer.isBuffer(message) ? message.toString('utf8') : message;

    if (messageStr === '') {
      ws.heartbeatTimer = 0;
    } else if (messageStr.charAt(0) === '{') {
      this.onJsonMessage(ws, messageStr);
    } else {
      this.onSimpleMessage(ws, messageStr);
    }
  }

  onSimpleMessage(ws: any, message: string): void {
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
        } else {
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

  onJsonMessage(ws: any, messageStr: string): void {
    let message: any;
    try {
      message = JSON.parse(messageStr);
      if (typeof message.command !== 'string') {
        throw new Error('Received an invalid JSON message');
      }
    } catch (e) {
      return this.onError(ws, e as Error);
    }
    if (message.command === 'join') {
      if (ws.tank) {
        this.onError(ws, new Error('Client tried to join twice.'));
      } else {
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
  onJoinMessage(ws: any, message: any): void {
    if (typeof message.nick !== 'string' || message.nick.length > 20) {
      this.onError(ws, new Error('Client specified invalid nickname.'));
    }
    if (typeof message.team !== 'number' || message.team < 0 || message.team > 5) {
      this.onError(ws, new Error('Client specified invalid team.'));
    }

    ws.tank = this.spawn(Tank, message.team);
    ws.tank.name = message.nick;
    ws.nick = message.nick;

    // Log player join with details
    const teamName = getTeamName(message.team);
    console.log(`[PLAYER JOIN] Player "${message.nick}" joined team ${teamName} (tank idx=${ws.tank.idx}, tank_idx=${ws.tank.tank_idx})`);
    console.log(`[PLAYERS] Total tanks in game: ${this.tanks.length}`);
    console.log(`[PLAYERS] Connected players: ${this.tanks.map((t: any) => `${t.name || 'Unknown'} (team=${getTeamName(t.team)})`).join(', ')}`);

    // Mark client as NOT synchronized yet - sendPackets() will handle initial sync
    ws.synchronized = false;
    ws.needsInitialSync = true;
  }

  onTextMessage(ws: any, tank: any, message: any): void {
    if (typeof message.text !== 'string' || message.text.length > 140) {
      this.onError(ws, new Error('Client sent an invalid text message.'));
    }

    this.broadcast(
      JSON.stringify({
        command: 'msg',
        idx: tank.idx,
        text: message.text,
      })
    );
  }

  onTeamTextMessage(ws: any, tank: any, message: any): void {
    if (typeof message.text !== 'string' || message.text.length > 140) {
      this.onError(ws, new Error('Client sent an invalid text message.'));
    }
    if (tank.team === 255) return;

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

  onError(ws: any, error: Error): void {
    console.error('WebSocket error:', error.message);
    // Optionally close the connection
    // ws.close();
  }

  // Helpers

  /**
   * Simple helper to send a message to everyone (only synchronized clients).
   */
  broadcast(message: string): void {
    for (const client of this.clients) {
      if (client.synchronized) {
        client.send(message);
      }
    }
  }

  /**
   * We send critical updates every frame, and non-critical updates every other frame. On top of
   * that, non-critical updates may be dropped, if the client's hearbeats are interrupted.
   */
  sendPackets(): void {
    // Check if any clients need initial sync
    const newClients = this.clients.filter(c => c.needsInitialSync);
    const hasNewClients = newClients.length > 0;

    // Toggle oddTick normally (don't force it for new clients)
    this.oddTick = !this.oddTick;

    // Create packets for existing clients
    let smallPacket: any;
    let largePacket: any;

    if (this.oddTick) {
      smallPacket = this.changesPacket(true);
      smallPacket = Buffer.from(smallPacket).toString('base64');
      largePacket = smallPacket;
    } else {
      smallPacket = this.changesPacket(false);
      largePacket = smallPacket.concat(this.updatePacket());
      smallPacket = Buffer.from(smallPacket).toString('base64');
      largePacket = Buffer.from(largePacket).toString('base64');
    }

    // For new clients, create a separate full sync packet
    let newClientPacket: any;
    if (hasNewClients) {
      // Create full snapshot of all objects for new clients
      console.log(`[INITIAL_SYNC] Building initial sync packet, objects.length=${this.objects.length}`);
      const savedChanges = this.changes;
      this.changes = [];
      for (let i = 0; i < this.objects.length; i++) {
        const obj = this.objects[i];
        if (obj) {
          console.log(`[INITIAL_SYNC] Including object at array index ${i}, idx=${obj.idx}, type=${obj.constructor.name}`);
          // Use obj.idx (not array index) to match the server's object index
          this.changes.push(['create', obj, obj.idx] as [string, any, number]);
        }
      }
      console.log(`[INITIAL_SYNC] Total objects to sync: ${this.changes.length}`);
      newClientPacket = this.changesPacket(true, true);  // Pass isInitialSync=true
      this.changes = savedChanges;  // Restore changes for existing clients
      newClientPacket = Buffer.from(newClientPacket).toString('base64');
    }

    // Send packets to all clients
    for (const client of this.clients) {
      // Handle initial sync for new clients
      if (client.needsInitialSync) {
        // Send full snapshot
        client.send(newClientPacket);

        // Send welcome packet
        const welcomePacket = Buffer.from(pack('BH', net.WELCOME_MESSAGE, client.tank.idx)).toString('base64');
        client.send(welcomePacket);

        // Mark as synchronized
        client.synchronized = true;
        client.needsInitialSync = false;
        client.justSynchronized = true;  // Skip packets next tick (already have everything)
        continue;
      }

      // Send regular updates to synchronized clients
      if (!client.synchronized) continue;

      // Skip packets for clients that just synchronized (they already have everything from initial sync)
      if (client.justSynchronized) {
        client.justSynchronized = false;
        continue;  // Skip this tick entirely
      }

      if (client.heartbeatTimer > 40) {
        client.send(smallPacket);
      } else {
        client.send(largePacket);
        client.heartbeatTimer++;
      }
    }

    // Now broadcast nicks for new clients AFTER all packets have been sent
    // This ensures the CREATE messages arrive before the nick commands
    for (const client of newClients) {
      this.broadcast(
        JSON.stringify({
          command: 'nick',
          idx: client.tank.idx,
          nick: client.nick,
        })
      );
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
  changesPacket(fullCreate: boolean, isInitialSync: boolean = false): number[] {
    if (this.changes.length === 0) return [];

    console.log(`[CHANGES_PACKET] fullCreate=${fullCreate}, isInitialSync=${isInitialSync}, changes count=${this.changes.length}`);

    let data: number[] = [];
    const needUpdate: any[] = [];

    for (const change of this.changes) {
      // Don't mutate the change tuple - destructure without modifying
      const [type, obj, idx] = change;

      switch (type) {
        case 'create': {
          // Skip null objects - they're just placeholders to preserve indices
          if (!obj) break;
          console.log(`[CHANGES_PACKET] CREATE: type=${obj.constructor.name}, idx=${idx}, _net_type_idx=${obj._net_type_idx}`);
          // Always send TINY_UPDATE after CREATE to initialize object state
          needUpdate.push(obj);
          // Only add to newlyCreated if this is a real creation (not initial sync)
          if (!isInitialSync) {
            this.newlyCreated.add(obj);  // Mark as newly created in instance variable
          }
          // Send both type index and object index so client can maintain sparse array structure
          data = data.concat([net.CREATE_MESSAGE], pack('BH', obj._net_type_idx, idx));
          break;
        }
        case 'destroy': {
          console.log(`[CHANGES_PACKET] DESTROY: idx=${idx}`);
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
          console.log(`[MAPCHANGE] x=${x}, y=${y}, ascii='${ascii}' (code=${asciiCode}), life=${life}, mine=${mine}`);
          const packed = pack('BBBBf', x, y, asciiCode, life, mine);
          console.log(`[MAPCHANGE] Packed ${packed.length} bytes:`, packed);
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

    console.log(`[CHANGES_PACKET] needUpdate count=${needUpdate.length}`);
    for (const obj of needUpdate) {
      // CRITICAL FIX: Newly created objects must ALWAYS use isCreate=true for TINY_UPDATE
      // because the client sets isCreate=true based on _createdViaMessage flag
      // If we send isCreate=false but client expects isCreate=true, byte counts won't match!
      const useFullCreate = fullCreate || this.newlyCreated.has(obj);
      const objData = this.dump(obj, useFullCreate);
      console.log(`[CHANGES_PACKET] TINY_UPDATE: type=${obj.constructor.name}, idx=${obj.idx}, data length=${objData.length}, isCreate=${useFullCreate}`);
      data = data.concat([net.TINY_UPDATE_MESSAGE], pack('H', obj.idx), objData);
    }

    console.log(`[CHANGES_PACKET] Total packet length=${data.length}`);

    // Clear changes array so they don't get re-broadcast
    this.changes = [];

    return data;
  }

  /**
   * Get a data stream for non-critical updates.
   */
  updatePacket(): number[] {
    return [net.UPDATE_MESSAGE].concat(this.dumpTick(false, this.newlyCreated));
  }
}

helpers.extend(BoloServerWorld.prototype, BoloWorldMixin);
allObjects.registerWithWorld(BoloServerWorld.prototype);

// HTTP server application

interface ServerConfig {
  web: {
    port: number;
    log?: boolean;
  };
  general: {
    base: string;
    maxgames: number;
  };
  irc?: any;
}

export class Application {
  options: ServerConfig;
  connectServer: any;
  httpServer!: http.Server;
  games: Record<string, any> = {};
  ircClients: any[] = [];
  maps!: MapIndex;
  loop: any;
  demo?: any;
  tickCounter: number = 0;

  constructor(options: ServerConfig = {} as ServerConfig) {
    this.options = options;
    // When running with tsx, __filename is src/server/application.ts, so ../../ goes to project root
    const webroot = path.join(path.dirname(fs.realpathSync(__filename)), '../../');

    this.connectServer = connect();
    if (this.options.web?.log) {
      // Modern connect doesn't have logger middleware by default
      this.connectServer.use('/', (req: any, res: any, next: any) => {
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
        if (err) console.log(err);
      });
    });

    // API endpoints for lobby (after this.games and this.maps are initialized)
    this.connectServer.use('/api/maps', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      const mapList = Object.keys(this.maps.nameIndex).map(name => ({
        name,
        path: this.maps.nameIndex[name].path
      }));
      res.end(JSON.stringify(mapList));
    });

    this.connectServer.use('/api/games', (req: any, res: any) => {
      if (req.method === 'GET') {
        // List active games
        res.setHeader('Content-Type', 'application/json');
        const gameList = Object.keys(this.games).map(gid => ({
          gid,
          url: this.games[gid].url,
          mapName: this.games[gid].map.name || 'Unknown',
          playerCount: this.games[gid].tanks.length
        }));
        res.end(JSON.stringify(gameList));
      } else if (req.method === 'POST') {
        // Create new game with specified map
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => {
          try {
            const { mapName } = JSON.parse(body);
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

              const game = this.createGame(data);
              game.map.name = mapName; // Store map name for reference

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                gid: game.gid,
                url: game.url,
                mapName,
                playerCount: 0
              }));
            });
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
        });
      } else {
        res.statusCode = 405;
        res.end('Method not allowed');
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
  resetDemo(cb?: (err: string | null) => void): void {
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

  haveOpenSlots(): boolean {
    return Object.getOwnPropertyNames(this.games).length < this.options.general.maxgames;
  }

  createGameId(): string {
    const charset = 'abcdefghijklmnopqrstuvwxyz';
    let gid: string;
    while (true) {
      const chars: string[] = [];
      for (let i = 0; i < 20; i++) {
        chars.push(charset.charAt(mathRound(mathRandom() * (charset.length - 1))));
      }
      gid = chars.join('');
      if (!this.games.hasOwnProperty(gid)) break;
    }
    return gid;
  }

  createGame(mapData: Buffer): any {
    const map = WorldMap.load(mapData);

    const gid = this.createGameId();
    const game = new BoloServerWorld(map);
    this.games[gid] = game;
    game.gid = gid;
    game.url = `${this.options.general.base}/match/${gid}`;
    console.log(`Created game '${gid}'`);
    this.startLoop();

    return game;
  }

  closeGame(game: any): void {
    delete this.games[game.gid];
    this.possiblyStopLoop();
    game.close();
    console.log(`Closed game '${game.gid}'`);
  }

  registerIrcClient(irc: any): void {
    this.ircClients.push(irc);
  }

  listen(...args: any[]): void {
    this.httpServer = this.connectServer.listen.apply(this.connectServer, args);

    // Setup WebSocket server
    const wss = new WebSocketServer({ noServer: true });

    this.httpServer.on('upgrade', (request: http.IncomingMessage, socket: any, head: Buffer) => {
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

  shutdown(): void {
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

  startLoop(): void {
    this.loop.start();
  }

  possiblyStopLoop(): void {
    // Never stop the loop - we need it running to perform cleanup checks on empty games
    // The loop will continue as long as there are games (including the demo game)
  }

  tick(): void {
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

        // Check if game has been empty for over an hour
        if (game.emptyStartTime !== null &&
            game.emptyStartTime !== undefined &&
            (now - game.emptyStartTime) > ONE_HOUR_MS) {
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
  getSocketPathHandler(pathname: string): ((ws: any) => void) | false {
    // FIXME: Simple lobby with chat and match making.
    if (pathname === '/lobby') return false;

    // FIXME: Match joining based on a UUID.
    const matchRegex = /^\/match\/([a-z]{20})$/;
    const m = matchRegex.exec(pathname);
    if (m) {
      if (this.games.hasOwnProperty(m[1])) {
        return (ws: any) => this.games[m[1]].onConnect(ws);
      } else {
        return false;
      }
    }

    // FIXME: This is the temporary entry point.
    if (pathname === '/demo' && this.demo) {
      return (ws: any) => this.demo.onConnect(ws);
    }

    return false;
  }
}

// Entry point

/**
 * Helper middleware to redirect from '/match/*'.
 */
function redirector(base: string) {
  return (req: any, res: any, next: any) => {
    const m = /^\/match\/([a-z]{20})$/.exec(req.url);
    if (m) {
      const query = `?${m[1]}`;
      res.writeHead(301, { Location: `${base}/${query}` });
      res.end();
    } else {
      next();
    }
  };
}

/**
 * Don't export a server directly, but this factory function. Once called, the timer loop will
 * start. I believe it's untidy to have timer loops start after a simple require().
 */
function createBoloApp(options: ServerConfig): Application {
  return new Application(options);
}

export default createBoloApp;
