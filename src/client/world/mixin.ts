/**
 * Client World Mixin
 *
 * Common logic between `BoloLocalWorld` and `BoloClientWorld`
 */

import { createLoop } from '../../villain/loop';
import { Progress } from '../progress';
import { Vignette } from '../vignette';
import { SoundKit } from '../soundkit';
import DefaultRenderer from '../renderer/offscreen_2d';
import { OverviewMap } from '../overview';
import { TICK_LENGTH_MS, PIXEL_SIZE_WORLD, TILE_SIZE_PIXELS, FOG_WINDOW_W, FOG_WINDOW_H } from '../../constants';
import * as helpers from '../../helpers';
import BoloWorldMixin from '../../world_mixin';

// Arrow keys are reserved for map panning and cannot be assigned to other actions.
const RESERVED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// World units moved per render frame (~60 fps) while an arrow key is held.
const PAN_SPEED = 20 * PIXEL_SIZE_WORLD;   // 20 px/frame

// Fraction of the current offset removed per frame when no key is held (drift-back).
const PAN_RETURN = 0.06;

declare const applicationCache: any;

export interface IBoloClientWorldMixin {
  start(): void;
  waitForCache(vignette: Vignette, callback: () => void): void;
  loadResources(vignette: Vignette, callback: () => void): void;
  loadImages(i: (name: string) => void): void;
  loadSounds(s: (name: string) => void): void;
  commonInitialization(): void;
  toggleOverview(): void;
  failure(message: string): void;
  checkBuildOrder(action: string, cell: any): [string | false, number?, boolean?];
  boloInit(): void;
  addTank(tank: any): void;
  removeTank(tank: any): void;
  getAllMapObjects(): any[];
  spawnMapObjects(): void;
  resolveMapObjectOwners(): void;
  insert(obj: any): void;
}

export const BoloClientWorldMixin = {
  start(this: any): void {
    const vignette = new Vignette();
    this.waitForCache(vignette, () => {
      this.loadResources(vignette, () => {
        this.loaded(vignette);
      });
    });
  },

  /**
   * Wait for the applicationCache to finish downloading.
   */
  waitForCache(this: any, vignette: Vignette, callback: () => void): void {
    // FIXME: Use applicationCache again.
    return callback();

    // Commented out old cache logic
    /*
    vignette.message('Checking for newer versions');

    const handleDownloading = () => {
      vignette.message('Downloading latest version');
      vignette.showProgress();
      applicationCache.addEventListener('progress', handleProgress);
    };

    const handleProgress = (e: ProgressEvent) => {
      vignette.progress(e.loaded / e.total);
    };

    const handleUpdateReady = () => {
      vignette.hideProgress();
      vignette.message('Reloading latest version');
      location.reload();
    };

    const afterCache = () => {
      vignette.hideProgress();
      cleanup();
      callback();
    };

    const cleanup = () => {
      applicationCache.removeEventListener('downloading', handleDownloading);
      applicationCache.removeEventListener('progress', handleProgress);
      applicationCache.removeEventListener('updateready', handleUpdateReady);
      applicationCache.removeEventListener('cached', afterCache);
      applicationCache.removeEventListener('noupdate', afterCache);
    };

    applicationCache.addEventListener('downloading', handleDownloading);
    applicationCache.addEventListener('updateready', handleUpdateReady);
    applicationCache.addEventListener('cached', afterCache);
    applicationCache.addEventListener('noupdate', afterCache);
    */
  },

  /**
   * Loads all required resources.
   */
  loadResources(this: any, vignette: Vignette, callback: () => void): void {
    vignette.message('Loading resources');
    const progress = new Progress();

    this.images = {};
    this.loadImages((name: string) => {
      this.images[name] = new Image();
      const img = this.images[name];
      const step = progress.add();
      img.addEventListener('load', step, { once: true });
      img.src = `images/${name}.png`;
    });

    this.soundkit = new SoundKit();
    this.loadSounds((name: string) => {
      const src = `sounds/${name}.ogg`;
      const parts = name.split('_');
      for (let i = 1; i < parts.length; i++) {
        parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1);
      }
      const methodName = parts.join('');
      this.soundkit.load(methodName, src, progress.add());
    });

    if (typeof applicationCache === 'undefined') {
      vignette.showProgress();
      progress.on('progress', (p: Progress) => vignette.progress(p.loaded / p.total));
    }
    progress.on('complete', () => {
      vignette.hideProgress();
      callback();
    });
    progress.wrapUp();
  },

  loadImages(this: any, i: (name: string) => void): void {
    i('base');
    i('styled');
    i('overlay');
  },

  loadSounds(this: any, s: (name: string) => void): void {
    s('big_explosion_far');
    s('big_explosion_near');
    s('bubbles');
    s('farming_tree_far');
    s('farming_tree_near');
    s('hit_tank_far');
    s('hit_tank_near');
    s('hit_tank_self');
    s('man_building_far');
    s('man_building_near');
    s('man_dying_far');
    s('man_dying_near');
    s('man_lay_mine_near');
    s('mine_explosion_far');
    s('mine_explosion_near');
    s('shooting_far');
    s('shooting_near');
    s('shooting_self');
    s('shot_building_far');
    s('shot_building_near');
    s('shot_tree_far');
    s('shot_tree_near');
    s('tank_sinking_far');
    s('tank_sinking_near');
  },

  /**
   * Common initialization once the map is available.
   */
  commonInitialization(this: any): void {
    this.renderer = new DefaultRenderer(this);

    this.map.world = this;
    this.map.setView(this.renderer);

    this.boloInit();

    // Overview map (default `O`). Created before the loop starts so it records
    // discovered ground from the very first frame, even while it's closed.
    this.overview = new OverviewMap(this);

    this.loop = createLoop({
      rate: TICK_LENGTH_MS,
      tick: () => {
        this.tick();
        // Vision tracking rides the tick, not the frame — see OverviewMap#trackVision.
        this.overview.trackVision();
      },
      frame: (alpha: number) => {
        this.renderer.draw(alpha);
        this.overview.render();
      },
    });

    this.increasingRange = false;
    this.decreasingRange = false;
    this.rangeAdjustTimer = 0;

    // Initialize view mode
    this.viewMode = 'tank';
    this.currentPillboxIndex = 0;

    // Pan state
    this.panX = 0;
    this.panY = 0;
    this.panLeftHeld  = false;
    this.panRightHeld = false;
    this.panUpHeld    = false;
    this.panDownHeld  = false;

    // Load key bindings from cookie or use defaults
    const getCookie = (name: string): string | null => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
      return null;
    };

    const defaultKeys = {
      accelerate: 'KeyW',
      decelerate: 'KeyS',
      turnLeft: 'KeyA',
      turnRight: 'KeyD',
      increaseRange: 'KeyL',
      decreaseRange: 'Semicolon',
      shoot: 'Space',
      layMine: 'Tab',
      tankView: 'Enter',
      pillboxView: 'KeyP',
      overview: 'KeyO',
      toggleBrain: 'KeyB',
      autoSlowdown: true,
      autoGunsight: true
    };

    const savedKeys = getCookie('keyBindings');
    this.keyBindings = savedKeys ? { ...defaultKeys, ...JSON.parse(savedKeys) } : defaultKeys;

    this.input = document.createElement('input');
    this.input.id = 'input-dummy';
    this.input.type = 'text';
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('readonly', 'true');
    this.input.style.caretColor = 'transparent'; // Hide the cursor
    document.body.insertBefore(this.input, this.renderer.canvas);
    this.input.focus();

    const elements = [this.input, this.renderer.canvas];
    const toolLabels = document.querySelectorAll('#tool-select label');
    elements.push(...Array.from(toolLabels));

    const handleKeydown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;

      // Overview map: toggles from anywhere. While it's open every other key is
      // ignored, so the map can be read without the tank reacting to stray input.
      if (code === this.keyBindings.overview) {
        this.toggleOverview();
        return;
      }
      if (this.overview?.isOpen) return;

      // Arrow keys are dedicated to view panning — not remappable.
      if (code === 'ArrowLeft')  { this.panLeftHeld  = true; return; }
      if (code === 'ArrowRight') { this.panRightHeld = true; return; }
      if (code === 'ArrowUp')    { this.panUpHeld    = true; return; }
      if (code === 'ArrowDown')  { this.panDownHeld  = true; return; }

      // Tank-view key: snap pan back to centre immediately.
      if (code === this.keyBindings.tankView) {
        this.panX = 0;
        this.panY = 0;
        this.panLeftHeld = this.panRightHeld = this.panUpHeld = this.panDownHeld = false;
      }

      // Check for range adjustment keys
      if (code === this.keyBindings.increaseRange) {
        this.increasingRange = true;
      } else if (code === this.keyBindings.decreaseRange) {
        this.decreasingRange = true;
      } else {
        // Pass to specific implementation (client or local)
        this.handleKeydown(e);
      }
    };

    const handleKeyup = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;

      // Controls are frozen while the overview is open. Any key held when it opened
      // was already released by `toggleOverview`, so dropping the keyup is safe.
      if (this.overview?.isOpen) return;

      // Arrow keys: release pan direction.
      if (code === 'ArrowLeft')  { this.panLeftHeld  = false; return; }
      if (code === 'ArrowRight') { this.panRightHeld = false; return; }
      if (code === 'ArrowUp')    { this.panUpHeld    = false; return; }
      if (code === 'ArrowDown')  { this.panDownHeld  = false; return; }

      // Check for range adjustment keys
      if (code === this.keyBindings.increaseRange) {
        this.increasingRange = false;
      } else if (code === this.keyBindings.decreaseRange) {
        this.decreasingRange = false;
      } else {
        // Pass to specific implementation (client or local)
        this.handleKeyup(e);
      }
    };

    // Also prevent keypress to stop browser accent menu
    const handleKeypress = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    for (const element of elements) {
      element.addEventListener('keydown', handleKeydown);
      element.addEventListener('keyup', handleKeyup);
      element.addEventListener('keypress', handleKeypress);
    }
  },

  /**
   * Show or hide the full-screen overview map.
   *
   * Opening it freezes the controls, so every held key is released first — otherwise a
   * key held at that moment would never see its keyup (they're swallowed while open) and
   * the tank would be left accelerating or turning forever.
   */
  toggleOverview(this: any): void {
    if (!this.overview) return;

    if (this.overview.isOpen) {
      this.overview.close();
      return;
    }

    this.releaseAllControls?.();
    this.panLeftHeld = this.panRightHeld = this.panUpHeld = this.panDownHeld = false;
    this.increasingRange = false;
    this.decreasingRange = false;
    this.overview.open();
  },

  /**
   * Method called when things go awry.
   */
  failure(this: any, message: string): void {
    if (this.loop) {
      this.loop.stop();
    }

    // Create a simple modal dialog replacement
    const dialog = document.createElement('div');
    dialog.textContent = message;
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border: 2px solid #333;
      z-index: 10000;
      font-family: sans-serif;
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
  },

  /**
   * Called every render frame. Advances the pan offset based on held arrow keys,
   * drifts it back to zero when no key is held, and clamps it so the tank stays
   * on-screen. Disabled during death / respawn (armour === 255 or fireball active).
   */
  updatePan(this: any): void {
    const player = this.player;

    // Disable pan (and drift back) while dead or in pillbox-view mode.
    const isDead = !player || player.armour === 255 || !!player.fireball;
    const isPillboxView = this.viewMode === 'pillbox';
    if (isDead || isPillboxView) {
      this.panX *= (1 - PAN_RETURN);
      this.panY *= (1 - PAN_RETURN);
      if (Math.abs(this.panX) < 0.5) this.panX = 0;
      if (Math.abs(this.panY) < 0.5) this.panY = 0;
      return;
    }

    if (this.panLeftHeld)  this.panX -= PAN_SPEED;
    if (this.panRightHeld) this.panX += PAN_SPEED;
    if (this.panUpHeld)    this.panY -= PAN_SPEED;
    if (this.panDownHeld)  this.panY += PAN_SPEED;

    // Drift back to centre only when the tank is moving and no arrow key is held.
    const tankMoving = player.speed > 0;
    if (tankMoving && !this.panLeftHeld && !this.panRightHeld) this.panX *= (1 - PAN_RETURN);
    if (tankMoving && !this.panUpHeld   && !this.panDownHeld)  this.panY *= (1 - PAN_RETURN);

    // Snap to exact zero once close enough.
    if (Math.abs(this.panX) < 0.5) this.panX = 0;
    if (Math.abs(this.panY) < 0.5) this.panY = 0;

    // Clamp so the tank stops inside the fog-of-war gradient.
    // 75% of the fog window half-width puts the tank about 1σ into the soft
    // fade zone at the extreme, so the fog itself is the visual stop cue.
    const maxPanX = (FOG_WINDOW_W * 1.0) * PIXEL_SIZE_WORLD;
    const maxPanY = (FOG_WINDOW_H * 1.0) * PIXEL_SIZE_WORLD;
    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  },

  /**
   * Add a build action to the LGM queue (max 10 entries).
   * Called when the user clicks a build target while the builder is away on a task.
   * The raw tool + cell are stored so the action is re-validated at execution time —
   * if the cell state has changed by the time the builder returns, the entry is skipped.
   */
  queueBuildOrder(this: any, tool: string, cell: any): void {
    if (!this.builderQueue)    this.builderQueue    = [];
    if (this.builderQueue.length >= 10) return;          // cap at 10
    this.builderQueue.push({ tool, cell });
  },

  /**
   * Called every render frame. When the builder returns to the tank, pop and
   * execute the next valid queued action.  Invalid/stale entries are skipped
   * automatically.  A dispatch-guard flag prevents double-sends during the
   * 1–3 frame network lag between sending the order and the server confirming
   * the builder has left the tank.
   */
  processBuilderQueue(this: any): void {
    if (!this.builderQueue || this.builderQueue.length === 0) return;
    if (!this.player || !this.player.builder) return;

    // Clear the queue when the tank dies so stale orders don't execute on respawn.
    if (this.player.armour === 255) {
      this.builderQueue = [];
      this._builderQueueDispatched = false;
      return;
    }

    const builder = this.player.builder.$;

    // Reset guard once we can confirm the builder is no longer idle.
    if (builder.order !== builder.states.inTank) {
      this._builderQueueDispatched = false;
      return;
    }

    // Guard: we already dispatched this cycle — wait for builder to go busy.
    if (this._builderQueueDispatched) return;

    while (this.builderQueue.length > 0) {
      const { tool, cell } = this.builderQueue.shift();
      const [action, trees] = this.checkBuildOrder(tool, cell);
      if (action) {
        this.buildOrder(action, trees, cell);
        this._builderQueueDispatched = true;  // guard until builder goes busy
        return;                               // one action per builder-return
      }
      // Stale/invalid entry — skip and try the next one.
    }
  },

  /**
   * Check and rewrite the build order that the user just tried to do.
   */
  checkBuildOrder(this: any, action: string, cell: any): [string | false, number?, boolean?] {
    const builder = this.player.builder.$;
    if (builder.order !== builder.states.inTank) return [false];

    // FIXME: These should notify the user why they failed.
    if (cell.mine) return [false];

    let result: [string | false, number?, boolean?];
    switch (action) {
      case 'forest':
        if (cell.base || cell.pill || !cell.isType('#')) {
          result = [false];
        } else {
          result = ['forest', 0];
        }
        break;
      case 'road':
        if (cell.base || cell.pill || cell.isType('|', '}', 'b', '^')) {
          result = [false];
        } else if (cell.isType('#')) {
          result = ['forest', 0];
        } else if (cell.isType('=')) {
          result = [false];
        } else if (cell.isType(' ') && cell.hasTankOnBoat()) {
          result = [false];
        } else {
          result = ['road', 2];
        }
        break;
      case 'building':
        if (cell.base || cell.pill || cell.isType('b', '^')) {
          result = [false];
        } else if (cell.isType('#')) {
          result = ['forest', 0];
        } else if (cell.isType('}')) {
          result = ['repair', 1];
        } else if (cell.isType('|')) {
          result = [false];
        } else if (cell.isType(' ')) {
          if (cell.hasTankOnBoat()) {
            result = [false];
          } else {
            result = ['boat', 5];
          }
        } else if (cell === this.player.cell) {
          result = [false];
        } else {
          result = ['building', 2];
        }
        break;
      case 'pillbox':
        if (cell.pill) {
          if (cell.pill.armour === 16) {
            result = [false];
          } else if (cell.pill.armour >= 11) {
            result = ['repair', 1, true];
          } else if (cell.pill.armour >= 7) {
            result = ['repair', 2, true];
          } else if (cell.pill.armour >= 3) {
            result = ['repair', 3, true];
          } else if (cell.pill.armour < 3) {
            result = ['repair', 4, true];
          } else {
            result = [false];
          }
        } else if (cell.isType('#')) {
          result = ['forest', 0];
        } else if (cell.base || cell.isType('b', '^', '|', '}', ' ')) {
          result = [false];
        } else if (cell === this.player.cell) {
          result = [false];
        } else {
          result = ['pillbox', 4];
        }
        break;
      case 'mine':
        if (cell.base || cell.pill || cell.isType('^', ' ', '|', 'b', '}')) {
          result = [false];
        } else {
          result = ['mine'];
        }
        break;
      default:
        result = [false];
    }

    const [resultAction, trees, flexible] = result;
    if (!resultAction) return [false];

    if (resultAction === 'mine') {
      if (this.player.mines === 0) return [false];
      return ['mine'];
    }
    if (resultAction === 'pill') {
      const pills = this.player.getCarryingPillboxes();
      if (pills.length === 0) return [false];
    }
    if (trees != null && this.player.trees < trees) {
      if (!flexible) return [false];
      return [resultAction, this.player.trees, flexible];
    }
    return result;
  },
};

helpers.extend(BoloClientWorldMixin, BoloWorldMixin);

export default BoloClientWorldMixin;
