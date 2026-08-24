/**
 * Local Game
 *
 * The `BoloLocalWorld` class implements a game local to the player's computer/browser.
 */

import { NetLocalWorld } from '../../villain/world/net/local';
import WorldMap from '../../world_map';
import EverardIsland from '../everard';
import * as allObjectsModule from '../../objects/all';
import { Tank } from '../../objects/tank';
import { decodeBase64 } from '../base64';
import * as helpers from '../../helpers';
import { Vignette } from '../vignette';
import BoloClientWorldMixin, { IBoloClientWorldMixin } from './mixin';

// Brain imports
import { brainOpen, syncBrainState } from '../../brain/brain_init';
import { aIndy_Think } from '../../brain/aindy_think';
import { buildBrainState, applyControls, resetStaticTerrainCache } from '../../brain/aindy_interface';
import { A4State } from '../../brain/a4_state';

// Visual effects
import { DeathOverlay } from '../death_overlay';
import { NewswireTicker } from '../newswire';
import { formatNewswire, NewswireActor, NewswireKind } from '../../newswire';

const allObjects = allObjectsModule;

// FIXME: Better error handling all around.

export interface BoloLocalWorld extends IBoloClientWorldMixin {}

export class BoloLocalWorld extends NetLocalWorld {
  authority: boolean = true;
  map!: any;
  player!: any;
  renderer!: any;
  loop!: any;
  increasingRange!: boolean;
  decreasingRange!: boolean;
  rangeAdjustTimer!: number;
  gunsightVisible: boolean = true;
  autoSlowdownActive: boolean = false;

  // ── Brain state ──────────────────────────────────────────────────────────
  brainEnabled: boolean = false;
  brainA4: A4State | null = null;
  brainTickCount: number = 0;

  // Pre-allocated map arrays (65536 bytes each, reused every tick)
  private _brainWorldMap:    Uint8Array = new Uint8Array(65536);
  private _brainDangerMap:   Uint8Array = new Uint8Array(65536);
  private _brainBlockedMap:  Uint8Array = new Uint8Array(65536);
  private _brainOccupancyMap:Uint8Array = new Uint8Array(65536);
  private _brainAllyMap:     Uint8Array = new Uint8Array(65536).fill(0xFF);
  private _brainSightMap:    Uint8Array = new Uint8Array(65536);
  private _brainVisitMap:    Uint8Array = new Uint8Array(65536);
  private _brainOwnerMap:    Uint8Array = new Uint8Array(65536).fill(0x10);

  // Brain HUD overlay element
  private _brainIndicator: HTMLElement | null = null;

  // Track armour to detect respawn (255 → <255 transition)
  private _brainPrevArmour: number = 40;

  // Death / respawn visual effect
  private _deathOverlay: DeathOverlay | null = null;
  private _deathOverlayPrevArmour: number = 40;

  // The newswire crawl. In local play this world IS the authority, so game objects call
  // newswire() below and it goes straight into the ticker with no network in between.
  newswireTicker: NewswireTicker | null = null;

  /**
   * Callback after resources have been loaded.
   */
  loaded(vignette: Vignette): void {
    this.map = WorldMap.load(decodeBase64(EverardIsland));
    this.commonInitialization();
    this.spawnMapObjects();
    this.player = this.spawn(Tank);
    this.player.spawn(0); // Initialize the tank with team 0
    this.renderer.initHud();
    const newswireEl = document.getElementById('newswire');
    if (newswireEl) this.newswireTicker = new NewswireTicker(newswireEl);
    this._deathOverlay = new DeathOverlay();
    vignette.destroy();
    this.loop.start();
  }

  /**
   * Announce a game event on the newswire. This world is the authority in local play, so the
   * line is formatted and handed straight to the ticker — the same seam the server implements
   * by broadcasting it.
   */
  newswire(kind: NewswireKind, actor: NewswireActor, other?: NewswireActor | null): void {
    this.newswireTicker?.add(formatNewswire(kind, actor, other), kind);
  }

  tick(): void {
    super.tick();

    // Step the newswire crawl one tick. Driven from the world tick and not rAF: a hidden tab
    // suspends rAF entirely and freezes timers for tens of seconds, and the right degradation
    // is a stalled crawl whose queue survives, not a dropped one.
    this.newswireTicker?.tick();

    // ── Death overlay ─────────────────────────────────────────────────────
    if (this._deathOverlay && this.player) {
      const armour = this.player.armour as number;
      if (this._deathOverlayPrevArmour !== 255 && armour === 255) {
        this._deathOverlay.triggerDeath();
      } else if (this._deathOverlayPrevArmour === 255 && armour !== 255) {
        this._deathOverlay.triggerRespawn();
      }
      this._deathOverlayPrevArmour = armour;
    }

    // ── Brain tick ─────────────────────────────────────────────────────────
    if (this.brainEnabled && this.brainA4 && this.player) {
      const armour = this.player.armour as number;
      if (armour !== 255) {
        this.runBrainTick();
      } else {
        // Tank is dead — track armour so we detect the respawn next tick
        this._brainPrevArmour = 255;
      }
    }

    // ── Range adjustment ────────────────────────────────────────────────────
    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) {
          this.player.increaseRange();
          const kb = (this as any).keyBindings;
          if (kb && kb.autoGunsight && this.player.firingRange === 7) {
            this.gunsightVisible = false;
          }
        } else {
          this.player.decreaseRange();
          const kb = (this as any).keyBindings;
          if (kb && kb.autoGunsight) {
            this.gunsightVisible = true;
          }
        }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }
  }

  /**
   * Reset brain navigation/goal state after respawn.
   * Called whenever armour transitions from 255 (dead) back to alive.
   * Clears the stale route table, explore target, and goal costs so the
   * brain re-evaluates everything from the new spawn position.
   */
  private _brainOnRespawn(): void {
    const a4 = this.brainA4!;

    // Force WorldRouteFind to re-initialise for the new position
    a4.worldCostsInitDone = 0;
    a4.worldRouteMinX = 0; a4.worldRouteMaxX = 255;
    a4.worldRouteMinY = 0; a4.worldRouteMaxY = 255;

    // Clear the explore target so a fresh tile is chosen
    a4.exploreTargetX = 0;
    a4.exploreTargetY = 0;

    // Reset all goal costs to inactive so ChooseGoal re-evaluates
    for (const g of a4.goals) g.cost = 0xFFFF;

    // Invalidate nav cache (stale route from old spawn position)
    a4.navCacheValid = 0;

    // Reset NewGetPill and KillBase attack-position state
    a4.newGetPillAPChosen = 0;
    a4.newGetPillStallTick = 0;
    a4.killBaseAttackPos = 0;
    a4.killBaseFirstShotFired = 0;
    a4.killBaseInProgress = 0;

    // Clear stale targets (they may now be unreachable from the new spawn)
    a4.killBaseTarget    = null;
    a4.baseToGetTarget   = null;
    a4.pillToGetTarget   = null;
    a4.pillToFixTarget   = null;
    a4.tankToKillTarget  = null;
    a4.manToKillTarget   = null;
  }

  /**
   * Run one brain tick: build state → aIndy_Think → apply controls to tank.
   */
  private runBrainTick(): void {
    const a4 = this.brainA4!;

    // Detect respawn: armour went from 255 (dead) back to alive
    const currentArmour = this.player.armour as number;
    if (this._brainPrevArmour === 255 && currentArmour !== 255) {
      this._brainOnRespawn();
    }
    this._brainPrevArmour = currentArmour;

    // Build BrainState from current Orona game objects
    const state = buildBrainState(
      this.player,          // OronaTankLike
      this.map,             // OronaMapLike
      (this as any).tanks ?? [], // all tanks
      this.brainTickCount++,
      this._brainWorldMap,
      this._brainDangerMap,
      this._brainBlockedMap,
      this._brainOccupancyMap,
      this._brainAllyMap,
      this._brainSightMap,
      this._brainVisitMap,
      this._brainOwnerMap,
    );

    // Clear all player control flags (brain takes full control)
    this.player.accelerating          = false;
    this.player.braking               = false;
    this.player.turningClockwise      = false;
    this.player.turningCounterClockwise = false;
    this.player.shooting              = false;
    this.player.layingMine            = false;

    // Run the brain
    const controls = aIndy_Think(a4, state);

    // Apply the resulting control word bits to the tank's boolean flags
    applyControls(this.player, controls);

    // Dispatch a builder action if the brain requested one. (Local play has no
    // network round-trip, so no queue-dispatch guard is needed.) Without this the
    // brain's builderAction was silently ignored in local games — the builder
    // never built walls/pillboxes/boats. Only dispatch when the builder is in-tank.
    const builderObj = this.player?.builder?.$ ?? null;
    if (builderObj && controls.builderAction && builderObj.order === builderObj.states.inTank) {
      const { action, trees, tileX, tileY } = controls.builderAction;
      const cell = this.map?.cellAtTile(tileX, tileY);
      if (cell) this.buildOrder(action, trees, cell);
    }

    // ── Console debug dump (once per second) ─────────────────────────────────
    if (a4.tickCounter % 50 === 0) {
      const GOAL_NAMES: Record<number, string> = {
        0:'PlacePill', 1:'Explore', 2:'FixPill', 3:'GetBase', 4:'GetMan',
        5:'GetPill', 6:'KillBase', 7:'KillMan', 8:'KillTank', 9:'Refuel',
        10:'TourBases', 12:'NoGoal',
      };
      const bestGoal = a4.goals.reduce((b, g) => g.cost < b.cost ? g : b, { goalIndex: 12, cost: 0xFFFF });
      const goalName = GOAL_NAMES[bestGoal.goalIndex] ?? `Goal${bestGoal.goalIndex}`;
      const goalCosts = a4.goals.map(g =>
        `${GOAL_NAMES[g.goalIndex] ?? g.goalIndex}=${g.cost === 0xFFFF ? '—' : g.cost}`
      ).join(' ');

      const target = a4.baseToGetTarget;
      const targetStr = target
        ? `base[${target.tileX},${target.tileY}] dist=${target.distToTank >> 8}tx`
        : a4.pillToGetTarget
          ? `pill[${a4.pillToGetTarget.tileX},${a4.pillToGetTarget.tileY}]`
          : 'none';

      const steer = controls.steeringWord;
      const fire  = controls.firingWord;
      const ctrlStr = [
        steer & 0x04 ? 'CCW' : '',
        steer & 0x08 ? 'CW'  : '',
        steer & 0x10 ? 'FWD' : '',
        steer & 0x20 ? 'BRK' : '',
        fire  & 0x10 ? 'FIRE': '',
      ].filter(Boolean).join('|') || 'idle';

      console.log(
        `[Brain t=${a4.tickCounter}] GOAL:${goalName}(${bestGoal.cost}) ` +
        `target:${targetStr} ` +
        `tile:(${a4.tankTileX},${a4.tankTileY}) ` +
        `ctrl:${ctrlStr} ` +
        `route:${a4.navCacheValid ? 'ok' : 'miss'} ` +
        `stall:${a4.tickCounter - a4.navStallSinceTick}tx ` +
        `noRoute:${a4.noLocalRouteFlag}\n` +
        `  costs: ${goalCosts}`
      );

    }
  }

  /**
   * Toggle brain control on/off.
   * On first enable: initialises the A4 state via brainOpen.
   * On disable: clears all tank control flags so the tank stops cleanly.
   */
  toggleBrainControl(): void {
    if (this.brainEnabled) {
      // Disengage brain
      this.brainEnabled = false;

      // Stop all movement so the tank doesn't keep the brain's last command
      this.player.accelerating          = false;
      this.player.braking               = true;   // gentle brake to stop
      this.player.turningClockwise      = false;
      this.player.turningCounterClockwise = false;
      this.player.shooting              = false;
      this.player.layingMine            = false;
      this.autoSlowdownActive           = false;

      this._hideBrainIndicator();
    } else {
      // Engage brain
      if (!this.brainA4) {
        // First activation: initialise brain state
        const state = buildBrainState(
          this.player,
          this.map,
          (this as any).tanks ?? [],
          0,
          this._brainWorldMap,
          this._brainDangerMap,
          this._brainBlockedMap,
          this._brainOccupancyMap,
          this._brainAllyMap,
          this._brainSightMap,
          this._brainVisitMap,
          this._brainOwnerMap,
        );
        this.brainA4 = brainOpen(state);
        if (!this.brainA4) {
          // brainOpen returned null: Borg proximity gate not set → still allow
          // by creating a bare A4State (brain will start in explore mode)
          this.brainA4 = new A4State();
        }
        this.brainTickCount = 1;
      }

      this.brainEnabled = true;
      this._showBrainIndicator();
    }
  }

  // ── Brain HUD indicator ─────────────────────────────────────────────────

  /**
   * Show the "BRAIN ACTIVE" status overlay in the Mac-classic style used by
   * the rest of the game's UI.
   */
  private _showBrainIndicator(): void {
    if (this._brainIndicator) return;

    const el = document.createElement('div');
    el.id = 'brain-indicator';
    el.textContent = '🧠 Brain Active';
    el.style.cssText = `
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 9000;
      background: #000;
      color: #fff;
      font-family: 'Chicago', 'Charcoal', 'Courier New', monospace;
      font-size: 11px;
      padding: 4px 10px;
      border: 2px solid #fff;
      box-shadow: 2px 2px 0 rgba(255,255,255,0.3);
      pointer-events: none;
      user-select: none;
      letter-spacing: 0.05em;
    `;
    document.body.appendChild(el);
    this._brainIndicator = el;
  }

  private _hideBrainIndicator(): void {
    this._brainIndicator?.remove();
    this._brainIndicator = null;
  }

  // ── Sound ─────────────────────────────────────────────────────────────────

  soundEffect(sfx: number, x: number, y: number, owner: any): void {
    this.renderer.playSound(sfx, x, y, owner);
  }

  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {
    // Terrain changed (a wall/road/boat built, forest harvested, wall destroyed, …).
    // Invalidate the brain's cached static-terrain layer so the change becomes visible
    // in its worldMap next tick. Terrain was wrongly assumed static; without this the
    // brain can never perceive cover it builds (checkBarriers reads the stale worldMap).
    resetStaticTerrainCache();
  }

  // ── Input handlers ────────────────────────────────────────────────────────
  // Note: these use e.code (not the deprecated e.keyCode) and consult
  // this.keyBindings so all keys are remappable from the Key Settings dialog.

  handleKeydown(e: KeyboardEvent): void {
    const code = e.code;
    const kb = (this as any).keyBindings;

    // Brain toggle: always active regardless of brain state
    if (code === kb.toggleBrain) {
      this.toggleBrainControl();
      return;
    }

    // When brain is controlling the tank, player keys are locked out
    if (this.brainEnabled) return;

    if (code === kb.shoot) {
      this.player.shooting = true;
    } else if (code === kb.turnLeft) {
      this.player.turningCounterClockwise = true;
    } else if (code === kb.accelerate) {
      this.player.accelerating = true;
      // Clear auto slowdown if it was active
      if (this.autoSlowdownActive) {
        this.player.braking = false;
        this.autoSlowdownActive = false;
      }
    } else if (code === kb.turnRight) {
      this.player.turningClockwise = true;
    } else if (code === kb.decelerate) {
      this.player.braking = true;
      this.autoSlowdownActive = false;
    } else if (code === kb.layMine) {
      this.player.layingMine = true;
    }
  }

  /**
   * Release every held control. Used when input is taken away from the player
   * mid-keypress (opening the overview map), so nothing stays stuck down.
   * The tank coasts: we stop accelerating without starting to brake.
   */
  releaseAllControls(): void {
    if (!this.player) return;
    this.player.shooting = false;
    this.player.layingMine = false;
    this.player.turningClockwise = false;
    this.player.turningCounterClockwise = false;
    this.player.accelerating = false;
    this.player.braking = false;
    this.autoSlowdownActive = false;
  }

  handleKeyup(e: KeyboardEvent): void {
    const code = e.code;
    const kb = (this as any).keyBindings;

    // Brain controls everything while active
    if (this.brainEnabled) return;

    if (code === kb.shoot) {
      this.player.shooting = false;
    } else if (code === kb.turnLeft) {
      this.player.turningCounterClockwise = false;
    } else if (code === kb.accelerate) {
      this.player.accelerating = false;
      // Auto slowdown: start braking when accelerate is released
      if (kb && kb.autoSlowdown) {
        this.player.braking = true;
        this.autoSlowdownActive = true;
      }
    } else if (code === kb.turnRight) {
      this.player.turningClockwise = false;
    } else if (code === kb.decelerate) {
      this.player.braking = false;
      this.autoSlowdownActive = false;
    } else if (code === kb.layMine) {
      this.player.layingMine = false;
    }
  }

  buildOrder(action: string, trees: number, cell: any): void {
    this.player.builder.$.performOrder(action, trees, cell);
  }
}

helpers.extend(BoloLocalWorld.prototype, BoloClientWorldMixin);
allObjects.registerWithWorld(BoloLocalWorld.prototype);

export default BoloLocalWorld;
