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
    <div id="join-dialog" style="
      background: #DDDDDD;
      border: 2px solid black;
      border-radius: 8px;
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
      padding: 0;
      min-width: 320px;
      font-family: 'Chicago', 'Charcoal', sans-serif;
      color: black;
    ">
      <div style="
        background: white;
        border-bottom: 1px solid black;
        padding: 8px 16px;
        text-align: center;
        font-weight: bold;
        font-size: 14px;
      ">Join Game</div>

      <div style="padding: 16px;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: bold; font-size: 12px;">Player Name</label>
          <input type="text" id="join-nick-field" name="join-nick-field" maxlength="20" style="
            width: 100%;
            border: 1px solid black;
            background: white;
            padding: 4px;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-size: 12px;
            box-sizing: border-box;
          "></input>
        </div>

        <div id="join-team" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 12px;">Choose a team</label>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <input type="radio" id="join-team-red" name="join-team" value="red" style="display: none;"></input>
            <label for="join-team-red" style="cursor: pointer;">
              <span class="bolo-team bolo-team-red" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-blue" name="join-team" value="blue" style="display: none;"></input>
            <label for="join-team-blue" style="cursor: pointer;">
              <span class="bolo-team bolo-team-blue" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-yellow" name="join-team" value="yellow" style="display: none;"></input>
            <label for="join-team-yellow" style="cursor: pointer;">
              <span class="bolo-team bolo-team-yellow" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-green" name="join-team" value="green" style="display: none;"></input>
            <label for="join-team-green" style="cursor: pointer;">
              <span class="bolo-team bolo-team-green" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-orange" name="join-team" value="orange" style="display: none;"></input>
            <label for="join-team-orange" style="cursor: pointer;">
              <span class="bolo-team bolo-team-orange" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-purple" name="join-team" value="purple" style="display: none;"></input>
            <label for="join-team-purple" style="cursor: pointer;">
              <span class="bolo-team bolo-team-purple" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>
          </div>
        </div>

        <div style="text-align: center;">
          <button type="button" id="join-submit" style="
            padding: 6px 24px;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          ">Join Game</button>
        </div>
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
  gunsightVisible: boolean = true;
  autoSlowdownActive: boolean = false;
  objects!: any[];
  tanks!: any[];
  lobbyRefreshInterval?: number;
  keyBindings!: any;
  viewMode!: 'tank' | 'pillbox';
  currentPillboxIndex!: number;
  teamScores: number[] = [0, 0, 0, 0, 0, 0];  // Scores for teams 0-5

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
    this.heartbeatTimer = 0;

    // Check if we have a game ID in the URL
    const m = /^\?([a-z]{20})$/.exec(location.search);
    if (m) {
      // Direct link to a game - connect immediately
      this.connectToGame(m[1]);
    } else if (location.search) {
      this.vignette.message('Invalid game ID');
      return;
    } else {
      // No game ID - show lobby
      this.showLobby();
    }
  }

  /**
   * Show the lobby to select or create a game
   */
  showLobby(): void {
    // Clear the loading message
    if (this.vignette) {
      this.vignette.message('');
    }

    // Create lobby UI
    const lobbyHTML = `
      <div id="lobby-dialog" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #DDDDDD;
        color: black;
        padding: 0;
        border: 2px solid black;
        border-radius: 8px;
        min-width: 600px;
        max-width: 800px;
        max-height: 80vh;
        overflow: hidden;
        font-family: 'Chicago', 'Charcoal', sans-serif;
        z-index: 10000;
        box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
      ">
        <div style="
          background: white;
          border-bottom: 1px solid black;
          padding: 8px 16px;
          text-align: center;
          font-weight: bold;
        ">Bolo Multiplayer Lobby</div>
        <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 60px);">

        <div id="active-games-section">
          <h2 style="margin: 0 0 10px 0; font-size: 14px;">Active Games</h2>
          <div id="active-games-list" style="margin-bottom: 20px; font-size: 12px;">
            Loading...
          </div>
        </div>

        <div id="create-game-section">
          <h2 style="margin: 20px 0 10px 0; font-size: 14px;">Create New Game</h2>
          <div style="margin-bottom: 10px; font-size: 12px;">
            <label for="map-select">Select Map:</label>
            <select id="map-select" style="
              margin-left: 10px;
              padding: 4px 8px;
              width: 300px;
              border: 1px solid black;
              background: white;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-size: 12px;
            ">
              <option value="">Loading maps...</option>
            </select>
          </div>
          <button id="create-game-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          " disabled>Create Game</button>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid black; padding-top: 20px;">
          <button id="how-to-play-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
            margin-right: 10px;
          ">How to Play</button>
          <button id="key-settings-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          ">Key Settings</button>
        </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', lobbyHTML);

    // Load maps and games
    this.loadMaps();
    this.loadGames();

    // Set up periodic refresh of game list (every 3 seconds)
    this.lobbyRefreshInterval = window.setInterval(() => {
      this.loadGames();
    }, 3000);

    // Set up create game button
    document.getElementById('create-game-btn')?.addEventListener('click', () => {
      this.createGame();
    });

    // Set up how to play button
    document.getElementById('how-to-play-btn')?.addEventListener('click', () => {
      this.showHowToPlay();
    });

    // Set up key settings button
    document.getElementById('key-settings-btn')?.addEventListener('click', () => {
      this.showKeySettings();
    });

    // Expose join function globally for the Join buttons
    (window as any).boloJoinGame = (gid: string) => this.connectToGame(gid);
  }

  /**
   * Load available maps from the server
   */
  async loadMaps(): Promise<void> {
    try {
      const response = await fetch('/api/maps');
      const maps = await response.json();

      const select = document.getElementById('map-select') as HTMLSelectElement;
      if (!select) return;

      select.innerHTML = maps.map((map: any) =>
        `<option value="${map.name}">${map.name}</option>`
      ).join('');

      const createBtn = document.getElementById('create-game-btn') as HTMLButtonElement;
      if (createBtn) createBtn.disabled = false;
    } catch (error) {
      console.error('Failed to load maps:', error);
    }
  }

  /**
   * Load active games from the server
   */
  async loadGames(): Promise<void> {
    try {
      const response = await fetch('/api/games');
      const games = await response.json();

      const gamesList = document.getElementById('active-games-list');
      if (!gamesList) return;

      if (games.length === 0) {
        gamesList.innerHTML = '<p style="color: #888;">No active games. Create one below!</p>';
      } else {
        gamesList.innerHTML = games.map((game: any) => `
          <div style="border: 1px solid #666; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${game.mapName}</strong>
              <span style="color: #888; margin-left: 10px;">${game.playerCount} player${game.playerCount !== 1 ? 's' : ''}</span>
            </div>
            <button onclick="window.boloJoinGame('${game.gid}')" style="padding: 5px 15px; cursor: pointer;">Join</button>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  }

  /**
   * Create a new game with the selected map
   */
  async createGame(): Promise<void> {
    const select = document.getElementById('map-select') as HTMLSelectElement;
    if (!select || !select.value) return;

    const mapName = select.value;

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapName })
      });

      const game = await response.json();

      if (response.ok) {
        // Connect to the new game
        this.connectToGame(game.gid);
      } else {
        alert(game.error || 'Failed to create game');
      }
    } catch (error) {
      console.error('Failed to create game:', error);
      alert('Failed to create game');
    }
  }

  /**
   * Show the key settings dialog
   */
  showKeySettings(): void {
    // Default key bindings
    const defaultKeys = {
      accelerate: 'ArrowUp',
      decelerate: 'ArrowDown',
      turnLeft: 'ArrowLeft',
      turnRight: 'ArrowRight',
      increaseRange: 'KeyL',
      decreaseRange: 'Semicolon',
      shoot: 'Space',
      layMine: 'Tab',
      tankView: 'Enter',
      pillboxView: 'KeyP',
      autoSlowdown: true,
      autoGunsight: true
    };

    // Load saved keys from cookies
    const savedKeys = getCookie('keyBindings');
    const keys = savedKeys ? { ...defaultKeys, ...JSON.parse(savedKeys) } : defaultKeys;

    // Helper to get friendly key name
    const getFriendlyKeyName = (code: string): string => {
      const keyMap: Record<string, string> = {
        'Space': 'Spc',
        'ArrowUp': '↑',
        'ArrowDown': '↓',
        'ArrowLeft': '←',
        'ArrowRight': '→',
        'Enter': 'Ret',
        'Tab': 'Tab',
        'Semicolon': ';',
        'Comma': ',',
        'Period': '.',
        'Slash': '/',
        'Backslash': '\\',
        'BracketLeft': '[',
        'BracketRight': ']',
        'Quote': "'",
        'Backquote': '`',
        'Minus': '-',
        'Equal': '='
      };

      if (keyMap[code]) return keyMap[code];
      if (code.startsWith('Key')) return code.substring(3);
      if (code.startsWith('Digit')) return code.substring(5);
      return code;
    };

    const dialogHTML = `
      <div id="key-settings-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="key-settings-dialog" style="
          background: #DDDDDD;
          border: 2px solid black;
          border-radius: 8px;
          box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
          padding: 0;
          min-width: 400px;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border-bottom: 1px solid black;
            padding: 8px 16px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
          ">Key Settings</div>
          <div style="padding: 16px;">

          <div style="margin-bottom: 16px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Drive tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Accelerate:</label>
              <input type="text" readonly class="key-input" data-binding="accelerate"
                value="${getFriendlyKeyName(keys.accelerate)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decelerate:</label>
              <input type="text" readonly class="key-input" data-binding="decelerate"
                value="${getFriendlyKeyName(keys.decelerate)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Rotate tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Anti-clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnLeft"
                value="${getFriendlyKeyName(keys.turnLeft)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnRight"
                value="${getFriendlyKeyName(keys.turnRight)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Gun range</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Increase:</label>
              <input type="text" readonly class="key-input" data-binding="increaseRange"
                value="${getFriendlyKeyName(keys.increaseRange)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decrease:</label>
              <input type="text" readonly class="key-input" data-binding="decreaseRange"
                value="${getFriendlyKeyName(keys.decreaseRange)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Weapons</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Shoot:</label>
              <input type="text" readonly class="key-input" data-binding="shoot"
                value="${getFriendlyKeyName(keys.shoot)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Lay mine:</label>
              <input type="text" readonly class="key-input" data-binding="layMine"
                value="${getFriendlyKeyName(keys.layMine)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Switch views</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Tank view:</label>
              <input type="text" readonly class="key-input" data-binding="tankView"
                value="${getFriendlyKeyName(keys.tankView)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Pillbox view:</label>
              <input type="text" readonly class="key-input" data-binding="pillboxView"
                value="${getFriendlyKeyName(keys.pillboxView)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="margin-top: 12px;">
              <div style="margin-bottom: 4px;">
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-slowdown" ${keys.autoSlowdown ? 'checked' : ''}>
                  Auto Slowdown
                </label>
              </div>
              <div>
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-gunsight" ${keys.autoGunsight ? 'checked' : ''}>
                  Enable automatic show &amp; hide of gunsight
                </label>
              </div>
            </div>
          </div>

          <div style="text-align: center; display: flex; gap: 8px; justify-content: center;">
            <button id="key-settings-cancel" style="
              padding: 6px 16px;
              border: 2px solid black;
              border-radius: 8px;
              background: white;
              cursor: pointer;
              min-width: 80px;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-weight: bold;
              font-size: 12px;
            ">Cancel</button>
            <button id="key-settings-ok" style="
              padding: 6px 16px;
              border: 2px solid black;
              border-radius: 8px;
              background: white;
              cursor: pointer;
              min-width: 80px;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-weight: bold;
              font-size: 12px;
            ">OK</button>
          </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // Store current bindings for editing
    const currentBindings: Record<string, any> = { ...keys };
    let capturingInput: HTMLInputElement | null = null;

    // Get all key input elements in order
    const keyInputs = Array.from(document.querySelectorAll('.key-input')) as HTMLInputElement[];

    // Helper to activate capture mode for an input
    const activateInput = (input: HTMLInputElement) => {
      capturingInput = input;
      input.value = '...';
      input.style.background = '#ffffcc';
    };

    // Set up key input click handlers
    keyInputs.forEach(input => {
      input.addEventListener('click', (e) => {
        const target = e.target as HTMLInputElement;
        activateInput(target);
      });
    });

    // Capture key press
    const keyHandler = (e: KeyboardEvent) => {
      if (!capturingInput) return;

      e.preventDefault();
      e.stopPropagation();

      const binding = capturingInput.getAttribute('data-binding');
      if (!binding) return;

      currentBindings[binding] = e.code;
      capturingInput.value = getFriendlyKeyName(e.code);
      capturingInput.style.background = 'white';

      // Find the next input and automatically activate it
      const currentIndex = keyInputs.indexOf(capturingInput);
      const nextIndex = currentIndex + 1;

      if (nextIndex < keyInputs.length) {
        // Move to next input
        activateInput(keyInputs[nextIndex]);
      } else {
        // No more inputs, clear capture mode
        capturingInput = null;
      }
    };

    document.addEventListener('keydown', keyHandler);

    // Cancel button
    document.getElementById('key-settings-cancel')?.addEventListener('click', () => {
      document.removeEventListener('keydown', keyHandler);
      document.getElementById('key-settings-overlay')?.remove();
    });

    // OK button
    document.getElementById('key-settings-ok')?.addEventListener('click', () => {
      // Get checkbox values
      currentBindings.autoSlowdown = (document.getElementById('auto-slowdown') as HTMLInputElement)?.checked;
      currentBindings.autoGunsight = (document.getElementById('auto-gunsight') as HTMLInputElement)?.checked;

      // Save to cookie
      setCookie('keyBindings', JSON.stringify(currentBindings));

      document.removeEventListener('keydown', keyHandler);
      document.getElementById('key-settings-overlay')?.remove();

      // If game is active, update the bindings
      if ((this as any).updateKeyBindings) {
        (this as any).updateKeyBindings(currentBindings);
      }
    });
  }

  /**
   * Show the "How to Play" guide
   */
  showHowToPlay(): void {
    const guideHTML = `
      <div id="how-to-play-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="how-to-play-dialog" style="
          background: #DDDDDD;
          border: 2px solid black;
          border-radius: 8px;
          box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
          padding: 0;
          max-width: 700px;
          max-height: 85vh;
          overflow: hidden;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border-bottom: 1px solid black;
            padding: 8px 16px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
          ">How to Play Bolo</div>
          <div style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 80px);">

          <div style="padding: 0 8px;">
            <!-- OBJECTIVE -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🎯 How to Win</div>
              <div style="font-size: 11px; line-height: 1.4;">
                Capture ALL bases on the map. Work with teammates on your color team to control territory, build defenses, and eliminate enemy bases.
              </div>
            </div>

            <!-- UNDERSTANDING THE SCREEN -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">📺 Understanding the Screen</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Bottom Right (Tank Status):</strong> Four yellow bars show your Shells, Mines, Armor (health), and Trees (building materials). Max 40 each.<br>
                <strong>Bottom Left:</strong> Three status panels show all Pillboxes (defense turrets), Bases (refuel stations), and Players. Checkerboard pattern = neutral/uncaptured.<br>
                <strong>Top Right (Stats):</strong> Your kills ☠, deaths †, and team rank ★<br>
                <strong>Top Center (Build Tools):</strong> Five tools: Forest (gather trees), Road, Building, Pillbox, Mine. Click to select, click map to build.<br>
                <strong>Targeting Reticle:</strong> Circular crosshair shows where your shots will land
              </div>
            </div>

            <!-- BASIC CONTROLS -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">⌨️ Controls</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Arrow Keys:</strong> Move and turn your tank<br>
                <strong>Space:</strong> Shoot (hold for auto-fire)<br>
                <strong>Tab:</strong> Drop mine behind tank<br>
                <strong>L/; (semicolon):</strong> Adjust gun range (1-7 tiles)<br>
                <strong>Enter/P:</strong> Switch camera views<br>
                <strong>T/R:</strong> Chat (all players / team only)<br>
                <strong>Mouse Click:</strong> Build selected item at location
              </div>
              <div style="font-size: 10px; margin-top: 3px; font-style: italic;">
                Customize controls in "Key Settings" (lobby)
              </div>
            </div>

            <!-- GETTING STARTED -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🚀 Getting Started</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>1. Gather Resources:</strong> Drive into forests (#) to collect trees. Select the Forest tool, click on trees to send your builder (little man) to chop them.<br>
                <strong>2. Capture Bases:</strong> Drive your tank onto checkerboard bases to capture them. They'll turn your team color and refuel your tank automatically.<br>
                <strong>3. Refuel:</strong> Park on your team's bases. They slowly transfer armor (health), shells, and mines to fill your tank.
              </div>
            </div>

            <!-- THE BUILDER SYSTEM -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🔨 Building System</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>How it works:</strong> Select a tool at top, click map location. A little man exits your tank, walks there, builds, and returns.<br>
                <strong>Forest tool:</strong> Chop trees, gain 4 trees<br>
                <strong>Road (0.5 trees):</strong> Build fast-travel paths<br>
                <strong>Building (0.5 trees):</strong> Build walls for defense<br>
                <strong>Pillbox (1 tree):</strong> Place defense turret (must be carrying one)<br>
                <strong>Mine (uses 1 mine):</strong> Lay explosive trap<br>
                <strong>Warning:</strong> Your builder can be killed! Protect him.
              </div>
            </div>

            <!-- BASES -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🏰 Bases (Refuel Stations)</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Capture:</strong> Drive onto checkerboard bases<br>
                <strong>Refuel:</strong> Park on your bases to restore armor, shells, and mines<br>
                <strong>Attack:</strong> Shoot enemy bases to damage them (5 armor per hit)<br>
                <strong>Regeneration:</strong> Bases slowly refill their supplies over time<br>
                <strong>Win Condition:</strong> Control all bases on the map
              </div>
            </div>

            <!-- PILLBOXES -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🛡️ Pillboxes (Defense Turrets)</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Auto-Defense:</strong> Pillboxes automatically shoot enemy tanks in range<br>
                <strong>Capturing:</strong> Shoot enemy pillboxes until disabled (0 armor), drive over to pick up, then rebuild using builder + 1 tree<br>
                <strong>Team Defense:</strong> Your team's pillboxes won't shoot teammates<br>
                <strong>Status:</strong> Check bottom-left panel—gray with X means disabled/dead
              </div>
            </div>

            <!-- COMBAT -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">⚔️ Combat Tips</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>•</strong> Adjust range (L/;) to hit targets accurately<br>
                <strong>•</strong> Watch your armor bar—when it hits 0, you die<br>
                <strong>•</strong> Respawn takes ~5 seconds after death<br>
                <strong>•</strong> Forest (#) hides you from enemy pillboxes if completely surrounded<br>
                <strong>•</strong> Mines damage any tank that drives over them (10 damage)<br>
                <strong>•</strong> Work with teammates—use team chat (R key)
              </div>
            </div>

            <!-- TEAM COLORS -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🎨 Team Colors</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Six teams:</strong> Red, Blue, Yellow, Green, Orange, Purple<br>
                <strong>Your team's color:</strong> Shows on bases, pillboxes, and team rank star<br>
                <strong>Checkerboard pattern:</strong> Neutral/uncaptured bases
              </div>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <button id="how-to-play-close" style="
                padding: 6px 24px;
                border: 2px solid black;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-family: 'Chicago', 'Charcoal', sans-serif;
                font-weight: bold;
                font-size: 12px;
              ">Close</button>
            </div>
          </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', guideHTML);

    // Close button handler
    document.getElementById('how-to-play-close')?.addEventListener('click', () => {
      document.getElementById('how-to-play-overlay')?.remove();
    });

    // Close on overlay click
    document.getElementById('how-to-play-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('how-to-play-overlay')) {
        document.getElementById('how-to-play-overlay')?.remove();
      }
    });
  }

  /**
   * Update key bindings from the settings dialog
   */
  updateKeyBindings(newBindings: any): void {
    this.keyBindings = newBindings;
  }

  /**
   * Connect to a specific game
   */
  connectToGame(gameId: string): void {
    // Stop lobby refresh interval
    if (this.lobbyRefreshInterval) {
      clearInterval(this.lobbyRefreshInterval);
      this.lobbyRefreshInterval = undefined;
    }

    // Remove lobby if present
    document.getElementById('lobby-dialog')?.remove();

    this.vignette?.message('Connecting to game...');

    const path = gameId === 'demo' ? '/demo' : `/match/${gameId}`;

    // Use wss:// for HTTPS, ws:// for HTTP
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${wsProtocol}//${location.host}${path}`);

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

    // Count players in each team
    const teamCounts = [0, 0, 0, 0, 0, 0]; // red, blue, yellow, green, orange, purple
    for (const tank of this.tanks) {
      if (tank.team >= 0 && tank.team < 6) {
        teamCounts[tank.team]++;
      }
    }

    // Find team with fewest players for default selection
    const teamNames = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
    let minCount = Math.min(...teamCounts);
    let disadvantaged = teamNames[teamCounts.indexOf(minCount)];

    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = JOIN_DIALOG_TEMPLATE;
    const dialog = dialogContainer.firstElementChild as HTMLElement;
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '10000';

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
      const label = dialog.querySelector(`label[for="join-team-${disadvantaged}"] span`) as HTMLElement;
      if (label) {
        label.style.borderWidth = '3px';
      }
    }

    // Add visual feedback for team selection
    const teamRadios = dialog.querySelectorAll('#join-team input[type="radio"]');
    teamRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        // Reset all borders
        dialog.querySelectorAll('#join-team label span').forEach((span) => {
          (span as HTMLElement).style.borderWidth = '2px';
        });
        // Highlight selected team
        const selectedLabel = dialog.querySelector(`label[for="${target.id}"] span`) as HTMLElement;
        if (selectedLabel) {
          selectedLabel.style.borderWidth = '3px';
        }
      });
    });

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
      case 'yellow':
        team = 2;
        break;
      case 'green':
        team = 3;
        break;
      case 'orange':
        team = 4;
        break;
      case 'purple':
        team = 5;
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

    // Keep brakes engaged during auto slowdown - they'll be released when
    // the player presses Accelerate or manually controls braking

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.ws) {
          if (this.increasingRange) {
            this.ws.send(net.INC_RANGE);
            // Auto hide gunsight when at max range
            if (this.keyBindings.autoGunsight && this.player && this.player.firingRange === 7) {
              this.gunsightVisible = false;
            }
          } else {
            this.ws.send(net.DEC_RANGE);
            // Auto show gunsight when decreasing range
            if (this.keyBindings.autoGunsight) {
              this.gunsightVisible = true;
            }
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
    const code = e.code;
    const kb = (this as any).keyBindings;

    if (code === kb.shoot) {
      this.ws.send(net.START_SHOOTING);
    } else if (code === kb.layMine) {
      this.ws.send(net.START_LAY_MINE);
    } else if (code === kb.turnLeft) {
      this.ws.send(net.START_TURNING_CCW);
    } else if (code === kb.accelerate) {
      this.ws.send(net.START_ACCELERATING);
      // Clear auto slowdown if it was active
      if (this.autoSlowdownActive) {
        this.ws.send(net.STOP_BRAKING);
        this.autoSlowdownActive = false;
      }
    } else if (code === kb.turnRight) {
      this.ws.send(net.START_TURNING_CW);
    } else if (code === kb.decelerate) {
      this.ws.send(net.START_BRAKING);
      this.autoSlowdownActive = false;
    } else if (code === kb.tankView) {
      this.switchToTankView();
    } else if (code === kb.pillboxView) {
      this.switchToPillboxView();
    } else if (code === 'KeyT') {
      this.openChat();
    } else if (code === 'KeyR') {
      this.openChat({ team: true });
    }
  }

  handleKeyup(e: KeyboardEvent): void {
    if (!this.ws || !this.player) return;
    const code = e.code;
    const kb = (this as any).keyBindings;

    if (code === kb.shoot) {
      this.ws.send(net.STOP_SHOOTING);
    } else if (code === kb.layMine) {
      this.ws.send(net.STOP_LAY_MINE);
    } else if (code === kb.turnLeft) {
      this.ws.send(net.STOP_TURNING_CCW);
    } else if (code === kb.accelerate) {
      this.ws.send(net.STOP_ACCELERATING);
      // Auto slowdown: start braking when accelerate is released
      if (kb.autoSlowdown) {
        this.ws.send(net.START_BRAKING);
        this.autoSlowdownActive = true;
      }
    } else if (code === kb.turnRight) {
      this.ws.send(net.STOP_TURNING_CW);
    } else if (code === kb.decelerate) {
      this.ws.send(net.STOP_BRAKING);
      this.autoSlowdownActive = false;
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

  /**
   * Switch to pillbox view mode, cycling through team pillboxes
   */
  switchToPillboxView(): void {
    if (!this.player || !this.map) return;

    // Get all pillboxes owned by the player's team
    const teamPillboxes = this.map.pills.filter((pill: any) => {
      return pill && !pill.inTank && !pill.carried && pill.armour > 0 &&
             pill.team === this.player.team;
    });

    if (teamPillboxes.length === 0) {
      // No pillboxes to view, stay in tank view
      return;
    }

    // If we're in tank view, start with the first pillbox
    if (this.viewMode === 'tank') {
      this.viewMode = 'pillbox';
      this.currentPillboxIndex = 0;
    } else {
      // Cycle to the next pillbox
      this.currentPillboxIndex = (this.currentPillboxIndex + 1) % teamPillboxes.length;
    }
  }

  /**
   * Switch back to tank view mode
   */
  switchToTankView(): void {
    this.viewMode = 'tank';
    this.currentPillboxIndex = 0;
  }

  /**
   * Get the current view target (tank or pillbox)
   */
  getViewTarget(): any {
    if (this.viewMode === 'tank' || !this.player || !this.map) {
      return null; // Will use default tank view
    }

    // Get all pillboxes owned by the player's team
    const teamPillboxes = this.map.pills.filter((pill: any) => {
      return pill && !pill.inTank && !pill.carried && pill.armour > 0 &&
             pill.team === this.player.team;
    });

    if (teamPillboxes.length === 0 || this.currentPillboxIndex >= teamPillboxes.length) {
      // No valid pillbox, return to tank view
      this.viewMode = 'tank';
      return null;
    }

    return teamPillboxes[this.currentPillboxIndex];
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
          const ate = this.handleBinaryCommand(command, data, pos);
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
        // Match server behavior: newly created objects always use isCreate=true
        const isCreate = !this._isSynchronized || (obj && obj._createdViaMessage);
        const additionalBytes = obj && obj.load ? obj.load(data, offset + bytes, isCreate) : 0;
        // Track ALL objects that received TINY_UPDATE in this packet so UPDATE can skip them
        // This prevents loading the same object twice in one packet
        if (obj) {
          this.objectsCreatedInThisPacket.add(obj);
        }
        // Clear the flag so it will be included in UPDATE messages in FUTURE packets
        if (obj && obj._createdViaMessage) {
          delete obj._createdViaMessage;
        }
        return bytes + additionalBytes;
      }

      case net.UPDATE_MESSAGE: {
        const bytes = this.netTick(data, offset, this.objectsCreatedInThisPacket);
        return bytes;
      }

      case net.TEAMSCORES_MESSAGE: {
        // Unpack 6 team scores (uint16 values, need to divide by 100)
        const [scores, bytes] = unpack('HHHHHH', data, offset);
        this.teamScores = scores.map(score => (score as number) / 100);
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
