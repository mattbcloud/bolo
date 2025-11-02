/**
 * Networked Game
 *
 * The `BoloClientWorld` class implements a networked game using a WebSocket.
 */

import { ClientWorld } from '../../villain/world/net/client';
import WorldMap from '../../world_map';
import * as allObjectsModule from '../../objects/all';
import { WorldPillbox } from '../../objects/world_pillbox';
import { WorldBase } from '../../objects/world_base';
import { unpack } from '../../struct';
import { decodeBase64 } from '../base64';
import * as net from '../../net';
import * as helpers from '../../helpers';
import { Vignette } from '../vignette';
import BoloClientWorldMixin, { IBoloClientWorldMixin } from './mixin';

const allObjects = allObjectsModule;

// FIXME: Better error handling all around.

export interface BoloClientWorld extends IBoloClientWorldMixin {}

const JOIN_DIALOG_TEMPLATE = `
    <div id="join-dialog">
      <div>
        <p>What is your name?</p>
        <p><input type="text" id="join-nick-field" name="join-nick-field" maxlength="20"></input></p>
      </div>
      <div id="join-team">
        <p>Choose a side:</p>
        <p>
          <input type="radio" id="join-team-red" name="join-team" value="red"></input>
          <label for="join-team-red"><span class="bolo-team bolo-team-red"></span></label>
          <input type="radio" id="join-team-blue" name="join-team" value="blue"></input>
          <label for="join-team-blue"><span class="bolo-team bolo-team-blue"></span></label>
        </p>
      </div>
      <div>
        <p><input type="button" name="join-submit" id="join-submit" value="Join game"></input></p>
      </div>
    </div>
  `;

// Simple cookie utility functions
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=31536000`;
}

export class BoloClientWorld extends ClientWorld {
  authority: boolean = false;
  mapChanges: Record<number, any> = {};
  processingServerMessages: boolean = false;
  objectsCreatedInThisPacket: Set<any> = new Set();  // Track objects created in current packet
  vignette!: Vignette | null;
  heartbeatTimer!: number;
  ws!: WebSocket | null;
  map!: any;
  player!: any;
  renderer!: any;
  loop!: any;
  joinDialog!: HTMLElement | null;
  chatMessages!: HTMLElement;
  chatContainer!: HTMLElement;
  chatInput!: HTMLInputElement & { team?: boolean };
  input!: HTMLInputElement;
  increasingRange!: boolean;
  decreasingRange!: boolean;
  rangeAdjustTimer!: number;
  objects!: any[];
  tanks!: any[];

  constructor() {
    super();
    this.mapChanges = {};
    this.processingServerMessages = false;
  }

  /**
   * Callback after resources have been loaded.
   */
  loaded(vignette: Vignette): void {
    this.vignette = vignette;
    this.vignette.message('Connecting to the multiplayer game');
    this.heartbeatTimer = 0;

    let path: string;
    const m = /^\?([a-z]{20})$/.exec(location.search);
    if (m) {
      path = `/match/${m[1]}`;
    } else if (location.search) {
      this.vignette.message('Invalid game ID');
      return;
    } else {
      path = '/demo';
    }

    this.ws = new WebSocket(`ws://${location.host}${path}`);

    this.ws.addEventListener('open', () => {
      this.connected();
    }, { once: true });

    this.ws.addEventListener('close', () => {
      this.failure('Connection lost');
    }, { once: true });
  }

  connected(): void {
    if (!this.vignette) return;
    this.vignette.message('Waiting for the game map');

    if (!this.ws) return;
    this.ws.addEventListener('message', (e: MessageEvent) => {
      this.receiveMap(e);
    }, { once: true });
  }

  /**
   * Callback after the map was received.
   */
  receiveMap(e: MessageEvent): void {
    this.map = WorldMap.load(decodeBase64(e.data));
    this.commonInitialization();
    if (this.vignette) {
      this.vignette.message('Waiting for the game state');
    }

    if (!this.ws) return;
    this.ws.addEventListener('message', (e: MessageEvent) => {
      this.handleMessage(e);
    });
  }

  /**
   * Callback after the server tells us we are synchronized.
   */
  synchronized(): void {
    this._isSynchronized = true;
    this.rebuildMapObjects();
    if (this.vignette) {
      this.vignette.destroy();
      this.vignette = null;
    }
    this.loop.start();

    let red = 0;
    let blue = 0;
    for (const tank of this.tanks) {
      if (tank.team === 0) red++;
      if (tank.team === 1) blue++;
    }
    const disadvantaged = blue < red ? 'blue' : 'red';

    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = JOIN_DIALOG_TEMPLATE;
    const dialog = dialogContainer.firstElementChild as HTMLElement;
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border: 2px solid #333;
      z-index: 10000;
    `;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
    this.joinDialog = dialog;

    const nickField = dialog.querySelector('#join-nick-field') as HTMLInputElement;
    if (nickField) {
      nickField.value = getCookie('nick') || '';
      nickField.focus();
      nickField.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.which === 13) this.join();
      });
    }

    const teamRadio = dialog.querySelector(`#join-team-${disadvantaged}`) as HTMLInputElement;
    if (teamRadio) {
      teamRadio.checked = true;
    }

    const submitButton = dialog.querySelector('#join-submit') as HTMLButtonElement;
    if (submitButton) {
      submitButton.addEventListener('click', () => {
        this.join();
      });
    }
  }

  join(): void {
    if (!this.joinDialog) return;

    const nickField = this.joinDialog.querySelector('#join-nick-field') as HTMLInputElement;
    const nick = nickField?.value;

    const teamRadio = this.joinDialog.querySelector('#join-team input:checked') as HTMLInputElement;
    const teamValue = teamRadio?.value;

    let team: number;
    switch (teamValue) {
      case 'red':
        team = 0;
        break;
      case 'blue':
        team = 1;
        break;
      default:
        team = -1;
    }

    if (!nick || team === -1) return;

    setCookie('nick', nick);

    // Remove dialog
    const parent = this.joinDialog.parentElement;
    const overlay = parent?.querySelector('div[style*="z-index: 9999"]');
    if (overlay) overlay.remove();
    this.joinDialog.remove();
    this.joinDialog = null;

    if (this.ws) {
      this.ws.send(JSON.stringify({ command: 'join', nick, team }));
    }
    this.input.focus();
  }

  /**
   * Callback after the welcome message was received.
   */
  receiveWelcome(tank: any): void {
    this.player = tank;
    this.renderer.initHud();
    this.initChat();
  }

  /**
   * Send the heartbeat (an empty message) every 10 ticks / 400ms.
   */
  tick(): void {
    super.tick();

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.ws) {
          if (this.increasingRange) {
            this.ws.send(net.INC_RANGE);
          } else {
            this.ws.send(net.DEC_RANGE);
          }
        }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }

    if (++this.heartbeatTimer === 10) {
      this.heartbeatTimer = 0;
      if (this.ws) {
        this.ws.send('');
      }
    }
  }

  failure(message: string): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    super.failure(message);
  }

  /**
   * On the client, this is a no-op.
   */
  soundEffect(sfx: number, x: number, y: number, owner: any): void {
    // No-op
  }

  /**
   * Override netSpawn to rebuild map objects after dynamic object creation.
   */
  netSpawn(data: number[], offset: number): number {
    const bytes = super.netSpawn(data, offset);
    // Rebuild map.pills and map.bases arrays to reflect the new object
    this.rebuildMapObjects();
    return bytes;
  }

  /**
   * Override netDestroy to rebuild map objects after dynamic object destruction.
   */
  netDestroy(data: number[], offset: number): number {
    const bytes = super.netDestroy(data, offset);
    // Rebuild map.pills and map.bases arrays to reflect the destroyed object
    this.rebuildMapObjects();
    return bytes;
  }

  /**
   * Keep track of map changes that we made locally. We only remember the last state of a cell
   * that the server told us about, so we can restore it to that state before processing
   * server updates.
   */
  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {
    if (this.processingServerMessages) return;
    if (this.mapChanges[cell.idx] == null) {
      cell._net_oldType = oldType;
      cell._net_hadMine = hadMine;
      cell._net_oldLife = oldLife;
      this.mapChanges[cell.idx] = cell;
    }
  }

  // Chat handlers

  initChat(): void {
    this.chatMessages = document.createElement('div');
    this.chatMessages.id = 'chat-messages';
    this.renderer.hud.appendChild(this.chatMessages);

    this.chatContainer = document.createElement('div');
    this.chatContainer.id = 'chat-input';
    this.chatContainer.style.display = 'none';
    this.renderer.hud.appendChild(this.chatContainer);

    this.chatInput = document.createElement('input') as HTMLInputElement & { team?: boolean };
    this.chatInput.type = 'text';
    this.chatInput.name = 'chat';
    this.chatInput.maxLength = 140;
    this.chatInput.addEventListener('keydown', (e) => this.handleChatKeydown(e));
    this.chatContainer.appendChild(this.chatInput);
  }

  openChat(options?: { team?: boolean }): void {
    options = options || {};
    this.chatContainer.style.display = 'block';
    this.chatInput.value = '';
    this.chatInput.focus();
    this.chatInput.team = options.team;
  }

  commitChat(): void {
    if (this.ws) {
      this.ws.send(
        JSON.stringify({
          command: this.chatInput.team ? 'teamMsg' : 'msg',
          text: this.chatInput.value,
        })
      );
    }
    this.closeChat();
  }

  closeChat(): void {
    this.chatContainer.style.display = 'none';
    this.input.focus();
  }

  receiveChat(who: any, text: string, options?: { team?: boolean }): void {
    options = options || {};
    const element = document.createElement('p');
    element.className = options.team ? 'msg-team' : 'msg';
    element.textContent = `<${who.name}> ${text}`;
    this.chatMessages.appendChild(element);
    window.setTimeout(() => {
      element.remove();
    }, 7000);
  }

  // Input handlers

  handleKeydown(e: KeyboardEvent): void {
    if (!this.ws || !this.player) return;
    switch (e.which) {
      case 32:
        this.ws.send(net.START_SHOOTING);
        break;
      case 37:
        this.ws.send(net.START_TURNING_CCW);
        break;
      case 38:
        this.ws.send(net.START_ACCELERATING);
        break;
      case 39:
        this.ws.send(net.START_TURNING_CW);
        break;
      case 40:
        this.ws.send(net.START_BRAKING);
        break;
      case 84:
        this.openChat();
        break;
      case 82:
        this.openChat({ team: true });
        break;
    }
  }

  handleKeyup(e: KeyboardEvent): void {
    if (!this.ws || !this.player) return;
    switch (e.which) {
      case 32:
        this.ws.send(net.STOP_SHOOTING);
        break;
      case 37:
        this.ws.send(net.STOP_TURNING_CCW);
        break;
      case 38:
        this.ws.send(net.STOP_ACCELERATING);
        break;
      case 39:
        this.ws.send(net.STOP_TURNING_CW);
        break;
      case 40:
        this.ws.send(net.STOP_BRAKING);
        break;
    }
  }

  handleChatKeydown(e: KeyboardEvent): void {
    if (!this.ws || !this.player) return;
    switch (e.which) {
      case 13:
        this.commitChat();
        break;
      case 27:
        this.closeChat();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  buildOrder(action: string, trees: number, cell: any): void {
    if (!this.ws || !this.player) return;
    trees = trees || 0;
    this.ws.send([net.BUILD_ORDER, action, trees, cell.x, cell.y].join(','));
  }

  // Network message handlers

  handleMessage(e: MessageEvent): void {
    let error: Error | null = null;
    if (e.data.charAt(0) === '{') {
      try {
        this.handleJsonCommand(JSON.parse(e.data));
      } catch (err) {
        error = err as Error;
      }
    } else if (e.data.charAt(0) === '[') {
      try {
        const messages = JSON.parse(e.data);
        for (const message of messages) {
          this.handleJsonCommand(message);
        }
      } catch (err) {
        error = err as Error;
      }
    } else {
      this.netRestore();
      try {
        const data = decodeBase64(e.data);
        let pos = 0;
        const length = data.length;
        this.processingServerMessages = true;
        // Clear the set of objects created in this packet
        this.objectsCreatedInThisPacket.clear();
        while (pos < length) {
          const command = data[pos++];
          console.log(`[MSG_PARSE] pos=${pos-1}, command=${command} (${String.fromCharCode(command)}), remaining=${length-pos}`);
          const ate = this.handleBinaryCommand(command, data, pos);
          console.log(`[MSG_PARSE] consumed ${ate} bytes, new pos=${pos + ate}`);
          pos += ate;
        }
        this.processingServerMessages = false;
        if (pos !== length) {
          error = new Error(`Message length mismatch, processed ${pos} out of ${length} bytes`);
        }
      } catch (err) {
        error = err as Error;
      }
    }
    if (error) {
      this.failure('Connection lost (protocol error)');
      if (console) {
        console.log('Following exception occurred while processing message:', e.data);
      }
      throw error;
    }
  }

  handleBinaryCommand(command: number, data: number[], offset: number): number {
    switch (command) {
      case net.SYNC_MESSAGE:
        this.synchronized();
        return 0;

      case net.WELCOME_MESSAGE: {
        const [[tank_idx], bytes] = unpack('H', data, offset);
        this.receiveWelcome(this.objects[tank_idx as number]);
        return bytes;
      }

      case net.CREATE_MESSAGE: {
        const bytes = this.netSpawn(data, offset);
        return bytes;
      }

      case net.DESTROY_MESSAGE: {
        const bytes = this.netDestroy(data, offset);
        return bytes;
      }

      case net.MAPCHANGE_MESSAGE: {
        const [[x, y, code, life, mine], bytes] = unpack('BBBBf', data, offset);
        const ascii = String.fromCharCode(code as number);
        const cell = this.map.cells[y as number][x as number];
        cell.setType(ascii, mine);
        cell.life = life as number;
        return bytes;
      }

      case net.SOUNDEFFECT_MESSAGE: {
        const [[sfx, x, y, owner], bytes] = unpack('BHHH', data, offset);
        this.renderer.playSound(sfx as number, x as number, y as number, this.objects[owner as number]);
        return bytes;
      }

      case net.TINY_UPDATE_MESSAGE: {
        const [[idx], bytes] = unpack('H', data, offset);
        const obj = this.objects[idx as number];
        // TINY_UPDATE for objects created via CREATE_MESSAGE should always use isCreate=true
        // Otherwise, use isCreate based on sync status
        const isCreate = (obj && obj._createdViaMessage) || !this._isSynchronized;
        const additionalBytes = obj && obj.load ? obj.load(data, offset + bytes, isCreate) : 0;
        // Track objects that received TINY_UPDATE in this packet so UPDATE can skip them
        if (obj && obj._createdViaMessage) {
          this.objectsCreatedInThisPacket.add(obj);
          // Clear the flag so it will be included in UPDATE messages in FUTURE packets
          delete obj._createdViaMessage;
        }
        return bytes + additionalBytes;
      }

      case net.UPDATE_MESSAGE: {
        const bytes = this.netTick(data, offset, this.objectsCreatedInThisPacket);
        return bytes;
      }

      default:
        throw new Error(`Bad command '${command}' from server, at offset ${offset - 1}`);
    }
  }

  handleJsonCommand(data: any): void {
    switch (data.command) {
      case 'nick':
        // Ignore if object doesn't exist yet (CREATE message may arrive after this)
        if (this.objects[data.idx]) {
          this.objects[data.idx].name = data.nick;
        }
        break;
      case 'msg':
        // Ignore if object doesn't exist yet (CREATE message may arrive after this)
        if (this.objects[data.idx]) {
          this.receiveChat(this.objects[data.idx], data.text);
        }
        break;
      case 'teamMsg':
        // Ignore if object doesn't exist yet (CREATE message may arrive after this)
        if (this.objects[data.idx]) {
          this.receiveChat(this.objects[data.idx], data.text, { team: true });
        }
        break;
      default:
        throw new Error(`Bad JSON command '${data.command}' from server.`);
    }
  }

  // Helpers

  /**
   * Fill `@map.pills` and `@map.bases` based on the current object list.
   */
  rebuildMapObjects(): void {
    this.map.pills = [];
    this.map.bases = [];
    for (const obj of this.objects) {
      if (obj instanceof WorldPillbox) {
        this.map.pills.push(obj);
      } else if (obj instanceof WorldBase) {
        this.map.bases.push(obj);
      } else {
        continue;
      }
      if (obj.cell) {
        obj.cell.retile();
      }
    }
  }

  /**
   * Override that reverts map changes as well.
   */
  netRestore(): void {
    super.netRestore();
    for (const idx in this.mapChanges) {
      const cell = this.mapChanges[idx];
      cell.setType(cell._net_oldType, cell._net_hadMine);
      cell.life = cell._net_oldLife;
    }
    this.mapChanges = {};
  }
}

helpers.extend(BoloClientWorld.prototype, BoloClientWorldMixin);
allObjects.registerWithWorld(BoloClientWorld.prototype);

export default BoloClientWorld;
