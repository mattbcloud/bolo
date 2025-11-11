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
    vignette.destroy();
    this.loop.start();
  }

  tick(): void {
    super.tick();

    // Keep brakes engaged during auto slowdown - they'll be released when
    // the player presses Accelerate or manually controls braking

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) {
          this.player.increaseRange();
          // Auto hide gunsight when at max range
          const kb = (this as any).keyBindings;
          if (kb && kb.autoGunsight && this.player.firingRange === 7) {
            this.gunsightVisible = false;
          }
        } else {
          this.player.decreaseRange();
          // Auto show gunsight when decreasing range
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

  soundEffect(sfx: number, x: number, y: number, owner: any): void {
    this.renderer.playSound(sfx, x, y, owner);
  }

  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {
    // No-op in local mode
  }

  // Input handlers

  handleKeydown(e: KeyboardEvent): void {
    const keyCode = e.which || e.keyCode;
    switch (keyCode) {
      case 32:
        this.player.shooting = true;
        break;
      case 37:
        this.player.turningCounterClockwise = true;
        break;
      case 38:
        this.player.accelerating = true;
        // Clear auto slowdown if it was active
        if (this.autoSlowdownActive) {
          this.player.braking = false;
          this.autoSlowdownActive = false;
        }
        break;
      case 39:
        this.player.turningClockwise = true;
        break;
      case 40:
        this.player.braking = true;
        this.autoSlowdownActive = false;
        break;
    }
  }

  handleKeyup(e: KeyboardEvent): void {
    const keyCode = e.which || e.keyCode;
    const kb = (this as any).keyBindings;
    switch (keyCode) {
      case 32:
        this.player.shooting = false;
        break;
      case 37:
        this.player.turningCounterClockwise = false;
        break;
      case 38:
        this.player.accelerating = false;
        // Auto slowdown: start braking when accelerate is released
        if (kb && kb.autoSlowdown) {
          this.player.braking = true;
          this.autoSlowdownActive = true;
        }
        break;
      case 39:
        this.player.turningClockwise = false;
        break;
      case 40:
        this.player.braking = false;
        this.autoSlowdownActive = false;
        break;
    }
  }

  buildOrder(action: string, trees: number, cell: any): void {
    this.player.builder.$.performOrder(action, trees, cell);
  }
}

helpers.extend(BoloLocalWorld.prototype, BoloClientWorldMixin);
allObjects.registerWithWorld(BoloLocalWorld.prototype);

export default BoloLocalWorld;
