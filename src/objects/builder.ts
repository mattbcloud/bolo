/**
 * Builder - The little man that comes out of tanks to build things
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance, heading } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import MineExplosion from './mine_explosion';

const { round, floor, ceil, min, cos, sin } = Math;

export type BuilderAction = 'forest' | 'road' | 'repair' | 'boat' | 'building' | 'pillbox' | 'mine';

export class Builder extends BoloObject {
  styled: boolean = true;
  team: number | null = null;

  states = {
    inTank: 0,
    waiting: 1,
    returning: 2,
    parachuting: 3,

    actions: {
      _min: 10,
      forest: 10,
      road: 11,
      repair: 12,
      boat: 13,
      building: 14,
      pillbox: 15,
      mine: 16,
    },
  };

  order: number = 0;
  x: number | null = null;
  y: number | null = null;
  targetX: number = 0;
  targetY: number = 0;
  trees: number = 0;
  hasMine: boolean = false;
  waitTimer: number = 0;
  animation: number = 0;
  cell: any = null;
  owner?: any;
  pillbox?: any;

  /**
   * Builders are only ever spawned and destroyed on the server.
   */
  constructor(world: any) {
    super(world);
    // Track position updates.
    this.on('netUpdate', (changes: any) => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        this.updateCell();
      }
    });
  }

  /**
   * Helper, called in several places that change builder position.
   */
  updateCell(): void {
    if (this.x != null && this.y != null) {
      this.cell = this.world.map.cellAtWorld(this.x, this.y);
    } else {
      this.cell = null;
    }
  }

  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('O', 'owner');
      p('B', 'team');  // Always send team during creation so parachute shows correct color
    }

    p('B', 'order');
    if (this.order === this.states.inTank) {
      this.x = this.y = null;
    } else {
      p('H', 'x');
      p('H', 'y');
      p('H', 'targetX');
      p('H', 'targetY');
      p('B', 'trees');
      p('O', 'pillbox');
      p('f', 'hasMine');
    }
    if (this.order === this.states.waiting) {
      p('B', 'waitTimer');
    }
  }

  getTile(): [number, number] {
    if (this.order === this.states.parachuting) {
      return [16, 1];
    } else {
      return [17, floor(this.animation / 3)];
    }
  }

  performOrder(action: BuilderAction, trees: number, cell: any): void {
    if (this.order !== this.states.inTank) return;
    if (!this.owner.$.onBoat && this.owner.$.cell !== cell && this.owner.$.cell.getManSpeed(this) === 0) {
      return;
    }

    let pill: any = null;
    if (action === 'mine') {
      if (this.owner.$.mines === 0) return;
      trees = 0;
    } else {
      if (this.owner.$.trees < trees) return;
      if (action === 'pillbox') {
        pill = this.owner.$.getCarryingPillboxes().pop();
        if (!pill) return;
        pill.inTank = false;
        pill.carried = true;
      }
    }

    this.trees = trees;
    this.hasMine = action === 'mine';
    this.ref('pillbox', pill);
    if (this.hasMine) this.owner.$.mines--;
    this.owner.$.trees -= trees;

    this.order = this.states.actions[action];
    this.x = this.owner.$.x;
    this.y = this.owner.$.y;
    [this.targetX, this.targetY] = cell.getWorldCoordinates();
    this.updateCell();
  }

  kill(): void {
    if (!this.world.authority) return;
    this.soundEffect(sounds.MAN_DYING);
    this.order = this.states.parachuting;
    this.trees = 0;
    this.hasMine = false;
    if (this.pillbox) {
      this.pillbox.$.placeAt(this.cell);
      this.ref('pillbox', null);
    }
    if (this.owner.$.armour === 255) {
      [this.targetX, this.targetY] = [this.x!, this.y!];
    } else {
      [this.targetX, this.targetY] = [this.owner.$.x, this.owner.$.y];
    }
    const startingPos = this.world.map.getRandomStart();
    [this.x, this.y] = startingPos.cell.getWorldCoordinates();
  }

  // World updates

  spawn(owner: any): void {
    this.ref('owner', owner);
    this.order = this.states.inTank;
  }

  anySpawn(): void {
    // Defensive check: owner might not be resolved yet during initial sync
    if (this.owner && this.owner.$) {
      this.team = this.owner.$.team;
    }
    this.animation = 0;
  }

  update(): void {
    if (this.order === this.states.inTank) return;

    // Defensive check: owner should never be null in normal operation
    // If it is null, it's likely a deserialization issue during initial sync
    // Skip update to avoid crashes
    if (!this.owner || !this.owner.$) {
      return;
    }

    this.animation = (this.animation + 1) % 9;

    switch (this.order) {
      case this.states.waiting:
        if (this.waitTimer-- === 0) this.order = this.states.returning;
        break;
      case this.states.parachuting:
        this.parachutingIn({ x: this.targetX, y: this.targetY });
        break;
      case this.states.returning:
        if (this.owner.$.armour !== 255) {
          this.move(this.owner.$, 128, 160);
        }
        break;
      default:
        this.move({ x: this.targetX, y: this.targetY }, 16, 144);
    }
  }

  move(target: any, targetRadius: number, boatRadius: number): void {
    // Safety check: if we don't have a valid cell, we can't move
    if (!this.cell) {
      return;
    }

    // Get our speed, and keep in mind special places a builder can move to.
    let speed = this.cell.getManSpeed(this);
    let onBoat = false;
    const targetCell = this.world.map.cellAtWorld(this.targetX, this.targetY);
    if (speed === 0 && this.cell === targetCell) {
      speed = 16;
    }
    if (this.owner.$.armour !== 255 && this.owner.$.onBoat && distance(this as any, this.owner.$) < boatRadius) {
      onBoat = true;
      speed = 16;
    }

    // Determine how far to move.
    speed = min(speed, distance(this as any, target));
    const rad = heading(this as any, target);
    const dx = round(cos(rad) * ceil(speed));
    const dy = round(sin(rad) * ceil(speed));
    const newx = this.x! + dx;
    const newy = this.y! + dy;

    // Check if we're running into an obstacle in either axis direction.
    let movementAxes = 0;
    if (dx !== 0) {
      const ahead = this.world.map.cellAtWorld(newx, this.y);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(this) > 0) {
        this.x = newx;
        movementAxes++;
      }
    }
    if (dy !== 0) {
      const ahead = this.world.map.cellAtWorld(this.x, newy);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(this) > 0) {
        this.y = newy;
        movementAxes++;
      }
    }

    // Are we there yet?
    if (movementAxes === 0) {
      this.order = this.states.returning;
    } else {
      this.updateCell();
      if (distance(this as any, target) <= targetRadius) {
        this.reached();
      }
    }
  }

  reached(): void {
    // Builder has returned to tank. Jump into the tank, and return resources.
    if (this.order === this.states.returning) {
      this.order = this.states.inTank;
      this.x = this.y = null;

      if (this.pillbox) {
        this.pillbox.$.inTank = true;
        this.pillbox.$.carried = false;
        this.ref('pillbox', null);
      }
      this.owner.$.trees = min(40, this.owner.$.trees + this.trees);
      this.trees = 0;
      if (this.hasMine) this.owner.$.mines = min(40, this.owner.$.mines + 1);
      this.hasMine = false;
      return;
    }

    // Is the builder trying to build on a mine? Yowch!
    if (this.cell.mine) {
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.world.spawn(MineExplosion, this.cell);
      }
      this.order = this.states.waiting;
      this.waitTimer = 20;
      return;
    }

    // Otherwise, build.
    // FIXME: possibly merge these checks with `checkBuildOrder`.
    switch (this.order) {
      case this.states.actions.forest:
        if (this.cell.base || this.cell.pill || !this.cell.isType('#')) break;
        this.cell.setType('.');
        this.trees = 4;
        this.soundEffect(sounds.FARMING_TREE);
        break;
      case this.states.actions.road:
        if (this.cell.base || this.cell.pill || this.cell.isType('|', '}', 'b', '^', '#', '=')) break;
        if (this.cell.isType(' ') && this.cell.hasTankOnBoat()) break;
        this.cell.setType('=');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.repair:
        if (this.cell.pill) {
          const used = this.cell.pill.repair(this.trees);
          this.trees -= used;
        } else if (this.cell.isType('}')) {
          this.cell.setType('|');
          this.trees = 0;
        } else {
          break;
        }
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.boat:
        if (!this.cell.isType(' ') || this.cell.hasTankOnBoat()) break;
        this.cell.setType('b');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.building:
        if (this.cell.base || this.cell.pill || this.cell.isType('b', '^', '#', '}', '|', ' ')) break;
        this.cell.setType('|');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.pillbox:
        if (this.cell.pill || this.cell.base || this.cell.isType('b', '^', '#', '|', '}', ' ')) break;
        this.pillbox.$.armour = 15;
        this.trees = 0;
        this.pillbox.$.placeAt(this.cell);
        this.ref('pillbox', null);
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.mine:
        if (this.cell.base || this.cell.pill || this.cell.isType('^', ' ', '|', 'b', '}')) break;
        this.cell.setType(null, true, 0);
        this.hasMine = false;
        this.soundEffect(sounds.MAN_LAY_MINE);
        break;
    }

    // Short pause while/after we build.
    this.order = this.states.waiting;
    this.waitTimer = 20;
  }

  parachutingIn(target: { x: number; y: number }): void {
    if (distance(this as any, target) <= 16) {
      this.order = this.states.returning;
    } else {
      const rad = heading(this as any, target);
      this.x = this.x! + round(cos(rad) * 3);
      this.y = this.y! + round(sin(rad) * 3);
      this.updateCell();
    }
  }
}

export default Builder;
