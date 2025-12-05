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

// Function to generate randomized team color HTML
function generateRandomizedTeamColors(): string {
  const teams = [
    { value: 'red', class: 'bolo-team-red' },
    { value: 'blue', class: 'bolo-team-blue' },
    { value: 'yellow', class: 'bolo-team-yellow' },
    { value: 'green', class: 'bolo-team-green' },
    { value: 'orange', class: 'bolo-team-orange' },
    { value: 'purple', class: 'bolo-team-purple' }
  ];

  // Fisher-Yates shuffle algorithm
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }

  // Generate HTML for shuffled teams
  return teams.map(team => `
            <input type="radio" id="join-team-${team.value}" name="join-team" value="${team.value}" style="display: none;"></input>
            <label for="join-team-${team.value}" style="cursor: pointer;">
              <span class="bolo-team ${team.class}" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>
  `).join('');
}

const JOIN_DIALOG_TEMPLATE = `
    <div id="join-dialog" style="
      background: #DDDDDD;
      border: 1px solid black;
      box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
      padding: 0;
      width: 350px;
      font-family: 'Chicago', 'Charcoal', sans-serif;
      color: black;
      display: flex;
      flex-direction: column;
    ">
      <div id="join-titlebar" style="
        background: white;
        border-bottom: 1px solid black;
        padding: 0;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
        position: relative;
      ">
        <div style="
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 30%;
          background-image: repeating-linear-gradient(
            0deg,
            black,
            black 1px,
            white 1px,
            white 2px
          );
        "></div>
        <div id="join-close" style="
          width: 13px;
          height: 13px;
          border: 1px solid black;
          background: white;
          margin-left: 4px;
          cursor: pointer;
          position: relative;
          z-index: 1;
        "></div>
        <div style="
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          font-weight: bold;
          font-size: 12px;
          color: black;
          background: white;
          padding: 0 8px;
          z-index: 1;
        ">Join Game</div>
        <div style="
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 30%;
          background-image: repeating-linear-gradient(
            0deg,
            black,
            black 1px,
            white 1px,
            white 2px
          );
        "></div>
        <div style="width: 13px;"></div>
      </div>

      <div style="padding: 16px; position: relative;">
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
          <div id="team-colors-container" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            ${generateRandomizedTeamColors()}
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

    this.addSystemCSSStyles();

    // Create lobby UI
    const lobbyHTML = `
      <div id="lobby-dialog" class="window" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 650px;
        min-height: 300px;
        max-height: 600px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
      ">
        <div id="lobby-titlebar" class="title-bar" style="cursor: move; user-select: none;">
          <button class="close" id="lobby-close" aria-label="Close"></button>
          <h1 class="title">Bolo Multiplayer Lobby</h1>
        </div>
        <div class="separator" style="flex-shrink: 0;"></div>
        <div class="window-pane" id="lobby-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">

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
          <button id="create-game-btn" class="btn" disabled>Create Game</button>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid black; padding-top: 20px;">
          <button id="how-to-play-btn" class="btn" style="margin-right: 10px;">How to Play</button>
          <button id="key-settings-btn" class="btn" style="margin-right: 10px;">Key Settings</button>
          <button id="team-stats-btn" class="btn">Team Stats</button>
        </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', lobbyHTML);

    const lobbyDialog = document.getElementById('lobby-dialog') as HTMLElement;
    const lobbyTitlebar = document.getElementById('lobby-titlebar') as HTMLElement;
    const lobbyCloseBtn = document.getElementById('lobby-close') as HTMLElement;

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

    // Set up team stats button
    document.getElementById('team-stats-btn')?.addEventListener('click', () => {
      this.showTeamStats();
    });

    // Expose join function globally for the Join buttons
    (window as any).boloJoinGame = (gid: string) => this.connectToGame(gid);

    // Close button handler
    lobbyCloseBtn?.addEventListener('click', () => {
      if (this.lobbyRefreshInterval) {
        clearInterval(this.lobbyRefreshInterval);
        this.lobbyRefreshInterval = undefined;
      }
      document.getElementById('lobby-dialog')?.remove();
    });

    // Make draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartX = 0;
    let dialogStartY = 0;

    lobbyTitlebar?.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === lobbyCloseBtn) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = lobbyDialog.getBoundingClientRect();
      dialogStartX = rect.left;
      dialogStartY = rect.top;
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        lobbyDialog.style.left = `${dialogStartX + deltaX}px`;
        lobbyDialog.style.top = `${dialogStartY + deltaY}px`;
        lobbyDialog.style.transform = 'none';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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

    this.addSystemCSSStyles();

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
        <div id="key-settings-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 500px;
          min-height: 400px;
          max-height: 600px;
          display: flex;
          flex-direction: column;
        ">
          <div id="key-settings-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="key-settings-close" aria-label="Close"></button>
            <h1 class="title">Key Settings</h1>
          </div>
          <div class="separator" style="flex-shrink: 0;"></div>
          <div class="window-pane" id="key-settings-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">

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
              <div class="field-row" style="margin-bottom: 8px;">
                <input type="checkbox" id="auto-slowdown" ${keys.autoSlowdown ? 'checked' : ''}>
                <label for="auto-slowdown">Auto Slowdown</label>
              </div>
              <div class="field-row">
                <input type="checkbox" id="auto-gunsight" ${keys.autoGunsight ? 'checked' : ''}>
                <label for="auto-gunsight">Enable automatic show &amp; hide of gunsight</label>
              </div>
            </div>
          </div>

          <div style="text-align: center; display: flex; gap: 8px; justify-content: center; padding: 8px 0;">
            <button id="key-settings-cancel" class="btn">Cancel</button>
            <button id="key-settings-ok" class="btn btn-default">OK</button>
          </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const dialog = document.getElementById('key-settings-dialog') as HTMLElement;
    const titlebar = document.getElementById('key-settings-titlebar') as HTMLElement;
    const closeBtn = document.getElementById('key-settings-close') as HTMLElement;

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

    // Close button handler
    closeBtn?.addEventListener('click', () => {
      document.removeEventListener('keydown', keyHandler);
      document.getElementById('key-settings-overlay')?.remove();
    });

    // Make draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartX = 0;
    let dialogStartY = 0;

    titlebar?.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === closeBtn) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      dialogStartX = rect.left;
      dialogStartY = rect.top;
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        dialog.style.left = `${dialogStartX + deltaX}px`;
        dialog.style.top = `${dialogStartY + deltaY}px`;
        dialog.style.transform = 'none';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

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
   * Add system.css base styles (call once)
   */
  addSystemCSSStyles(): void {
    if (document.getElementById('system-css-styles')) return; // Already added

    const style = document.createElement('style');
    style.id = 'system-css-styles';
    style.textContent = `
      :root {
        --primary: #FFFFFF;
        --secondary: #000000;
        --tertiary: #A5A5A5;
      }

      .window {
        display: flex;
        flex-direction: column;
        min-width: 320px;
        overflow: hidden;
        background-color: var(--primary);
        border: 2px solid var(--secondary);
        font-family: 'Chicago', 'Charcoal', sans-serif;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
      }

      .title-bar {
        flex: none;
        display: flex;
        align-items: center;
        height: 19px;
        margin: 2px 2px;
        padding: 2px 1px;
        background: linear-gradient(var(--secondary) 50%, transparent 50%);
        background-size: 6.67% 13.33%;
        background-clip: content-box;
      }

      .title-bar .title {
        padding: 0 8px;
        margin: 0 auto;
        font-size: 12px;
        font-weight: bold;
        line-height: 1.1;
        text-align: center;
        background: var(--primary);
        cursor: default;
      }

      .title-bar button {
        position: relative;
        display: block;
        width: 13px;
        height: 13px;
        margin: 0 2px;
        border: 1px solid var(--secondary);
        background-color: var(--primary);
        cursor: pointer;
        padding: 0;
      }

      .title-bar button.close::before,
      .title-bar button.close::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0;
      }

      .title-bar button.close:active::before,
      .title-bar button.close:active::after {
        opacity: 1;
      }

      .separator {
        height: 1px;
        background: var(--secondary);
        margin: 0;
      }

      .window-pane {
        overflow-y: scroll;
        overflow-x: hidden;
        height: 100%;
        padding: 16px;
        font-size: 11px;
        line-height: 1.4;
      }

      .window-pane::-webkit-scrollbar {
        width: 22px;
        background-color: var(--primary);
      }

      .window-pane::-webkit-scrollbar-track {
        background: linear-gradient(45deg, var(--secondary) 25%, transparent 25%,
          transparent 75%, var(--secondary) 75%, var(--secondary)),
          linear-gradient(45deg, var(--secondary) 25%, transparent 25%,
          transparent 75%, var(--secondary) 75%, var(--secondary));
        background-color: var(--primary);
        background-size: 4px 4px;
        background-position: 0 0, 2px 2px;
        width: 10px;
        border-left: 3px solid var(--secondary);
      }

      .window-pane::-webkit-scrollbar-thumb {
        width: 20px;
        box-sizing: content-box;
        background-color: var(--primary);
        border: 2px solid var(--secondary);
        border-right: none;
      }

      .window-pane::-webkit-scrollbar-button:horizontal:start:decrement,
      .window-pane::-webkit-scrollbar-button:horizontal:end:increment,
      .window-pane::-webkit-scrollbar-button:vertical:start:decrement,
      .window-pane::-webkit-scrollbar-button:vertical:end:increment {
        display: block;
      }

      .window-pane::-webkit-scrollbar-button:vertical:start {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5.5h21v22.375H.5z'/%3E%3Cpath fill='%23000' d='M1 23h20v-2H1zM1.375 12.375h5.5V11h-5.5zM6.875 17.875h6.875V16.5H6.875zM6.875 17.875v-5.5H5.5v5.5zM9.625 5.5V4.125H8.25V5.5zM11 4.125V2.75H9.625v1.375zM19.25 12.375V11h-1.375v1.375zM17.875 11V9.625H16.5V11zM16.5 9.625V8.25h-1.375v1.375zM15.125 8.25V6.875H13.75V8.25zM13.75 6.875V5.5h-1.375v1.375zM12.375 5.5V4.125H11V5.5zM8.25 6.875V5.5H6.875v1.375zM6.875 8.25V6.875H5.5V8.25zM5.5 9.625V8.25H4.125v1.375zM4.125 11V9.625H2.75V11z'/%3E%3Cpath fill='%23000' d='M2.75 12.375V11H1.375v1.375zM15.125 17.875v-5.5H13.75v5.5zM13.75 12.375h5.5V11h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:start:active {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5.5h21v22.38H.5z'/%3E%3Cpath fill='%23000' d='M1 23.005h20v-2H1zM1.375 12.378h5.5v-1.375h-5.5zM6.875 17.879h6.875V6.877H6.875zM6.875 17.879v-5.501H5.5v5.5zM9.625 5.501V4.126H8.25v1.375zM11 4.126V2.75H9.625v1.375zM19.25 12.378v-1.375h-1.375v1.375zM17.875 11.002V9.627H13.75v1.375zM16.5 9.627V8.252h-2.75v1.375zM15.125 8.252V6.877H13.75v1.375zM13.75 6.876V5.501h-1.375v1.375zM12.375 5.501V4.126h-2.75v1.375zM12.375 6.876V5.501h-5.5v1.375zM6.875 8.252V6.877H5.5v1.375zM6.875 9.627V8.252h-2.75v1.375zM6.875 11.002V9.627H2.75v1.375z'/%3E%3Cpath fill='%23000' d='M2.75 12.378v-1.375H1.375v1.375zM15.125 17.879v-5.501H13.75v5.5zM13.75 12.378h5.5v-1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:end {
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5 22.875h21V.5H.5z'/%3E%3Cpath fill='%23000' d='M1 .375h20v2H1zM1.375 11h5.5v1.375h-5.5zM6.875 5.5h6.875v1.375H6.875zM6.875 5.5V11H5.5V5.5zM9.625 17.875v1.375H8.25v-1.375zM11 19.25v1.375H9.625V19.25zM19.25 11v1.375h-1.375V11zM17.875 12.375v1.375H16.5v-1.375zM16.5 13.75v1.375h-1.375V13.75zM15.125 15.125V16.5H13.75v-1.375zM13.75 16.5v1.375h-1.375V16.5zM12.375 17.875v1.375H11v-1.375zM8.25 16.5v1.375H6.875V16.5zM6.875 15.125V16.5H5.5v-1.375zM5.5 13.75v1.375H4.125V13.75zM4.125 12.375v1.375H2.75v-1.375z'/%3E%3Cpath fill='%23000' d='M2.75 11v1.375H1.375V11zM15.125 5.5V11H13.75V5.5zM13.75 11h5.5v1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:end:active {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5 22.88h21V.5H.5z'/%3E%3Cpath fill='%23000' d='M1 .375h20v2H1zM1.375 11.002h5.5v1.375h-5.5zM6.875 5.501h6.875v11.002H6.875zM6.875 5.501v5.501H5.5v-5.5zM9.625 17.879v1.375H8.25v-1.375zM11 19.254v1.375H9.625v-1.375zM19.25 11.002v1.375h-1.375v-1.375zM17.875 12.378v1.375H13.75v-1.375zM16.5 13.753v1.375h-2.75v-1.375zM15.125 15.128v1.375H13.75v-1.375zM13.75 16.503v1.375h-1.375v-1.375zM12.375 17.879v1.375h-2.75v-1.375zM12.375 16.503v1.375h-5.5v-1.375zM6.875 15.128v1.375H5.5v-1.375zM6.875 13.753v1.375h-2.75v-1.375zM6.875 12.378v1.375H2.75v-1.375z'/%3E%3Cpath fill='%23000' d='M2.75 11.002v1.375H1.375v-1.375zM15.125 5.501v5.501H13.75v-5.5zM13.75 11.002h5.5v1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .btn {
        min-width: 59px;
        height: 20px;
        padding: 0 12px;
        border: 2px solid var(--secondary);
        border-radius: 8px;
        background: var(--primary);
        font-family: 'Chicago', 'Charcoal', sans-serif;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        text-align: center;
      }

      .btn:active {
        background: var(--secondary);
        color: var(--primary);
      }

      .btn-default {
        border-width: 3px;
      }

      .field-row {
        align-items: center;
        display: flex;
        font-size: 12px;
        overflow: visible;
        margin-left: 20px;
      }

      .field-row + .field-row {
        margin-top: 6px;
      }

      .field-row > * + * {
        margin-left: 6px;
      }

      input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: transparent;
        border: none;
        margin: 0;
        opacity: 0;
        position: fixed;
      }

      input[type="checkbox"] + label {
        position: relative;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        line-height: 13px;
        padding-left: 19px;
      }

      input[type="checkbox"] + label:before {
        content: "";
        display: block;
        height: 13px;
        width: 13px;
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        border: 1.5px solid var(--secondary);
        background: var(--primary);
        box-sizing: border-box;
      }

      input[type="checkbox"]:focus-visible + label:before {
        outline: 1px solid var(--secondary);
      }

      input[type="checkbox"]:hover + label:before {
        outline: 1px solid var(--secondary);
      }

      input[type="checkbox"]:checked + label:after {
        content: "";
        display: block;
        height: 12px;
        width: 12px;
        left: 0.5px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='1' height='1'/%3E%3Crect x='1' y='1' width='1' height='1'/%3E%3Crect x='2' y='2' width='1' height='1'/%3E%3Crect x='3' y='3' width='1' height='1'/%3E%3Crect x='4' y='4' width='1' height='1'/%3E%3Crect x='5' y='5' width='1' height='1'/%3E%3Crect x='6' y='6' width='1' height='1'/%3E%3Crect x='7' y='7' width='1' height='1'/%3E%3Crect x='8' y='8' width='1' height='1'/%3E%3Crect x='9' y='9' width='1' height='1'/%3E%3Crect x='10' y='10' width='1' height='1'/%3E%3Crect x='11' y='11' width='1' height='1'/%3E%3Crect x='11' y='0' width='1' height='1'/%3E%3Crect x='10' y='1' width='1' height='1'/%3E%3Crect x='9' y='2' width='1' height='1'/%3E%3Crect x='8' y='3' width='1' height='1'/%3E%3Crect x='7' y='4' width='1' height='1'/%3E%3Crect x='6' y='5' width='1' height='1'/%3E%3Crect x='5' y='6' width='1' height='1'/%3E%3Crect x='4' y='7' width='1' height='1'/%3E%3Crect x='3' y='8' width='1' height='1'/%3E%3Crect x='2' y='9' width='1' height='1'/%3E%3Crect x='1' y='10' width='1' height='1'/%3E%3Crect x='0' y='11' width='1' height='1'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
      }

      input[type="checkbox"][disabled] + label:before {
        background: var(--tertiary);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show the "How to Play" guide
   */
  showHowToPlay(): void {
    this.addSystemCSSStyles();

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
        <div id="how-to-play-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 650px;
          height: 500px;
        ">
          <div id="how-to-play-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="how-to-play-close" aria-label="Close"></button>
            <h1 class="title">How to Play Bolo</h1>
          </div>
          <div class="separator"></div>
          <div class="window-pane" id="how-to-play-content">

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
                <strong>Bottom Left:</strong> Three status panels show all Pillboxes (defense turrets), Bases (refuel stations), and Players.<br>
                <strong>Top Right (Stats):</strong> Your kills ☠, deaths †, and team rank ★<br>
                <strong>Top Center (Build Tools):</strong> Five tools: Forest (gather trees), Road, Building, Pillbox, Mine. Click to select, click map to build.<br>
                <strong>Targeting Reticle:</strong> Circular crosshair shows where your shots will land
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

          </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', guideHTML);

    const dialog = document.getElementById('how-to-play-dialog') as HTMLElement;
    const titlebar = document.getElementById('how-to-play-titlebar') as HTMLElement;
    const closeBtn = document.getElementById('how-to-play-close') as HTMLElement;

    // Close button handler
    closeBtn?.addEventListener('click', () => {
      document.getElementById('how-to-play-overlay')?.remove();
    });

    // Make draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartX = 0;
    let dialogStartY = 0;

    titlebar?.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === closeBtn) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      dialogStartX = rect.left;
      dialogStartY = rect.top;
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        dialog.style.left = `${dialogStartX + deltaX}px`;
        dialog.style.top = `${dialogStartY + deltaY}px`;
        dialog.style.transform = 'none';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Close on overlay click
    document.getElementById('how-to-play-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('how-to-play-overlay')) {
        document.getElementById('how-to-play-overlay')?.remove();
      }
    });
  }

  /**
   * Show the Team Stats modal with ranking graphs
   */
  showTeamStats(): void {
    this.addSystemCSSStyles();

    const statsHTML = `
      <div id="stats-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="stats-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 800px;
          min-height: 500px;
          max-height: 600px;
          display: flex;
          flex-direction: column;
        ">
          <div id="stats-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="stats-close" aria-label="Close"></button>
            <h1 class="title">Team Stats</h1>
          </div>
          <div class="separator" style="flex-shrink: 0;"></div>
          <div class="window-pane" id="stats-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: 16px;">

            <!-- Time Period Selector -->
            <div style="margin-bottom: 16px; font-size: 12px;">
              <select id="period-select" style="
                padding: 4px 8px;
                width: 150px;
                border: 1px solid black;
                background: white;
                font-family: 'Chicago', 'Charcoal', sans-serif;
                font-size: 12px;
              ">
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            <!-- Graph Container -->
            <div style="position: relative; height: 400px; background: white; border: 2px solid black; padding: 8px;">
              <canvas id="rankings-chart"></canvas>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', statsHTML);

    const dialog = document.getElementById('stats-dialog') as HTMLElement;
    const titlebar = document.getElementById('stats-titlebar') as HTMLElement;
    const closeBox = document.getElementById('stats-close') as HTMLElement;

    // Close box handler
    closeBox?.addEventListener('click', () => {
      document.getElementById('stats-overlay')?.remove();
    });

    // Make dialog draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartX = 0;
    let dialogStartY = 0;

    titlebar.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      dialogStartX = rect.left;
      dialogStartY = rect.top;
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        dialog.style.left = `${dialogStartX + deltaX}px`;
        dialog.style.top = `${dialogStartY + deltaY}px`;
        dialog.style.transform = 'none';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Close on overlay click
    document.getElementById('stats-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('stats-overlay')) {
        document.getElementById('stats-overlay')?.remove();
      }
    });

    // Period dropdown change handler
    const periodSelect = document.getElementById('period-select') as HTMLSelectElement;
    periodSelect?.addEventListener('change', (e) => {
      const period = (e.target as HTMLSelectElement).value;
      this.initializeStatsChart(period);
    });

    // Load Chart.js and initialize the graph with the selected period
    const initialPeriod = periodSelect?.value || 'hour';
    this.initializeStatsChart(initialPeriod);
  }

  /**
   * Initialize the Chart.js rankings chart
   */
  async initializeStatsChart(period: string): Promise<void> {
    // Dynamically import Chart.js
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    const canvas = document.getElementById('rankings-chart') as HTMLCanvasElement;
    if (!canvas) return;

    // Destroy existing chart if any
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    // Fetch mock data from API
    const response = await fetch(`/api/stats/rankings?period=${period}`);
    const { data } = await response.json();

    // Prepare chart data based on period
    let labels: string[] = [];
    let datasets: any[] = [];

    const teamColors = {
      red: '#FF0000',
      blue: '#0000FF',
      yellow: '#FFFF00',
      green: '#00FF00',
      orange: '#FFA500',
      purple: '#800080'
    };

    if (period === 'hour') {
      // Hour view: last hour with 5-minute intervals
      labels = data.map((d: any) => {
        const date = new Date(d.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      });

      Object.keys(teamColors).forEach(team => {
        datasets.push({
          label: team.charAt(0).toUpperCase() + team.slice(1),
          data: data.map((d: any) => d.rankings[team]),
          borderColor: teamColors[team as keyof typeof teamColors],
          backgroundColor: teamColors[team as keyof typeof teamColors],
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.1
        });
      });
    } else if (period === 'day') {
      // Day view: minute-by-minute data (sample every hour for readability)
      labels = data.filter((_: any, i: number) => i % 60 === 0).map((_: any, i: number) => {
        const hour = Math.floor((i * 60) / 60);
        const minute = (i * 60) % 60;
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      });

      Object.keys(teamColors).forEach(team => {
        datasets.push({
          label: team.charAt(0).toUpperCase() + team.slice(1),
          data: data.filter((_: any, i: number) => i % 60 === 0).map((d: any) => d.rankings[team]),
          borderColor: teamColors[team as keyof typeof teamColors],
          backgroundColor: teamColors[team as keyof typeof teamColors],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1
        });
      });
    } else if (period === 'week') {
      // Week view: hourly data over 7 days
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let lastDay = -1;
      labels = data.map((d: any) => {
        const date = new Date(d.timestamp);
        const currentDay = date.getDay();
        const dayName = dayNames[currentDay];
        const hours = date.getHours();

        // Show day label when the day changes (first point of each day)
        if (currentDay !== lastDay) {
          lastDay = currentDay;
          return `${dayName}`;
        }

        // For other hours, show empty string to reduce clutter
        return '';
      });

      Object.keys(teamColors).forEach(team => {
        datasets.push({
          label: team.charAt(0).toUpperCase() + team.slice(1),
          data: data.map((d: any) => d.rankings[team]),
          borderColor: teamColors[team as keyof typeof teamColors],
          backgroundColor: teamColors[team as keyof typeof teamColors],
          borderWidth: 2,
          pointRadius: 0,  // No points for hourly data (too many)
          tension: 0  // Straight lines for sparse data
        });
      });
    } else if (period === 'month') {
      // Month view: hourly data over 30 days (sample every 24 hours for readability)
      labels = data.filter((_: any, i: number) => i % 24 === 0).map((d: any) => {
        const date = new Date(d.timestamp);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      });

      Object.keys(teamColors).forEach(team => {
        datasets.push({
          label: team.charAt(0).toUpperCase() + team.slice(1),
          data: data.filter((_: any, i: number) => i % 24 === 0).map((d: any) => d.rankings[team]),
          borderColor: teamColors[team as keyof typeof teamColors],
          backgroundColor: teamColors[team as keyof typeof teamColors],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1
        });
      });
    } else if (period === 'year') {
      // Year view: hourly data over 365 days (already sampled every 24 hours by server)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      labels = data.map((d: any) => {
        const date = new Date(d.timestamp);
        return monthNames[date.getMonth()];
      });

      Object.keys(teamColors).forEach(team => {
        datasets.push({
          label: team.charAt(0).toUpperCase() + team.slice(1),
          data: data.map((d: any) => d.rankings[team]),
          borderColor: teamColors[team as keyof typeof teamColors],
          backgroundColor: teamColors[team as keyof typeof teamColors],
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.1
        });
      });
    }

    // Create chart with inverted Y-axis (rank 1 at top)
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            reverse: true, // Inverted: rank 1 at top
            min: 0.5,
            max: 6.5,
            ticks: {
              stepSize: 1,
              autoSkip: false,
              callback: (value) => {
                const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
                const intValue = Math.round(value as number);
                // Only show labels for integer ranks
                if (intValue >= 1 && intValue <= 6 && Math.abs(value as number - intValue) < 0.01) {
                  return ordinals[intValue];
                }
                return '';
              },
              font: {
                family: 'Chicago, Charcoal, sans-serif',
                size: 11
              }
            },
            afterBuildTicks: (axis: any) => {
              // Force ticks at 1, 2, 3, 4, 5, 6
              axis.ticks = [1, 2, 3, 4, 5, 6].map(v => ({ value: v }));
            },
            title: {
              display: false
            }
          },
          x: {
            ticks: {
              autoSkip: false,  // Show all labels (empty strings won't display)
              font: {
                family: 'Chicago, Charcoal, sans-serif',
                size: 10
              },
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
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
      nickField.value = '';
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

    // Get dialog elements for window functionality
    const joinTitlebar = dialog.querySelector('#join-titlebar') as HTMLElement;
    const joinCloseBox = dialog.querySelector('#join-close') as HTMLElement;

    // Close box handler
    joinCloseBox?.addEventListener('click', () => {
      const parent = dialog.parentElement;
      const overlay = parent?.querySelector('div[style*="z-index: 9999"]');
      if (overlay) overlay.remove();
      dialog.remove();
      this.joinDialog = null;
    });

    // Make draggable
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartX = 0;
    let dialogStartY = 0;

    joinTitlebar?.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === joinCloseBox || joinCloseBox?.contains(e.target as Node)) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      dialogStartX = rect.left;
      dialogStartY = rect.top;
    });

    const joinMouseMoveHandler = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      dialog.style.left = `${dialogStartX + deltaX}px`;
      dialog.style.top = `${dialogStartY + deltaY}px`;
      dialog.style.transform = 'none';
    };

    const joinMouseUpHandler = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', joinMouseMoveHandler);
    document.addEventListener('mouseup', joinMouseUpHandler);
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
