/**
 * The Tank class contains all the logic you need to tread well. (And all the other logic needed
 * to punish you if you don't.)
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Explosion from './explosion';
import MineExplosion from './mine_explosion';
import Shell from './shell';
import Fireball from './fireball';
import Builder from './builder';

const { round, floor, ceil, min, sqrt, max, sin, cos, PI } = Math;

export class Tank extends BoloObject {
  styled: boolean = true;
  team: number | null = null;

  // Movement
  speed: number = 0.0;
  slideTicks: number = 0;
  slideDirection: number = 0;
  accelerating: boolean = false;
  braking: boolean = false;

  // Turning
  direction: number = 0;
  turningClockwise: boolean = false;
  turningCounterClockwise: boolean = false;
  turnSpeedup: number = 0;

  // Resources
  shells: number = 40;
  mines: number = 0;
  armour: number = 40;
  trees: number = 0;

  // Combat
  reload: number = 0;
  shooting: boolean = false;
  layingMine: boolean = false;
  firingRange: number = 7;

  // Statistics
  kills: number = 0;
  deaths: number = 0;

  // Water/boat
  waterTimer: number = 0;
  onBoat: boolean = true;

  // Death/respawn
  respawnTimer?: number;
  fireball?: any;
  builder?: any;
  cell: any = null;

  /**
   * Tanks are only ever spawned and destroyed on the server.
   */
  constructor(world: any) {
    super(world);
    // Track position updates.
    this.on('netUpdate', (changes: any) => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y') || changes.armour === 255) {
        this.updateCell();
      }
    });
  }

  /**
   * Keep the player list updated.
   */
  anySpawn(): void {
    this.updateCell();
    this.world.addTank(this);
    this.on('finalize', () => this.world.removeTank(this));
  }

  /**
   * Helper, called in several places that change tank position.
   */
  updateCell(): void {
    if (this.x != null && this.y != null) {
      this.cell = this.world.map.cellAtWorld(this.x, this.y);
    } else {
      this.cell = null;
    }
  }

  /**
   * (Re)spawn the tank. Initializes all state. Only ever called on the server.
   */
  reset(): void {
    const startingPos = this.world.map.getRandomStart();
    [this.x, this.y] = startingPos.cell.getWorldCoordinates();
    this.direction = startingPos.direction * 16;
    this.updateCell();

    this.speed = 0.0;
    this.slideTicks = 0;
    this.slideDirection = 0;
    this.accelerating = false;
    this.braking = false;

    this.turningClockwise = false;
    this.turningCounterClockwise = false;
    this.turnSpeedup = 0;

    // FIXME: gametype dependant.
    this.shells = 40;
    this.mines = 0;
    this.armour = 40;
    this.trees = 0;

    this.reload = 0;
    this.shooting = false;
    this.layingMine = false;
    this.firingRange = 7;

    // Don't reset kills and deaths - they persist across respawns in the same game

    this.waterTimer = 0;
    this.onBoat = true;

    // Clear the fireball reference so camera stops following it
    this.fireball = null;
  }

  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('B', 'team');
      p('O', 'builder');
    }

    p('B', 'armour');

    // Are we dead?
    if (this.armour === 255) {
      p('O', 'fireball');
      this.x = this.y = null;
      return;
    } else {
      this.fireball?.clear();
    }

    p('H', 'x');
    p('H', 'y');
    p('B', 'direction');
    // Uses 0.25 increments, so we can pack this as a byte.
    p('B', 'speed', {
      tx: (v: number) => v * 4,
      rx: (v: number) => v / 4,
    });
    p('B', 'slideTicks');
    p('B', 'slideDirection');
    // FIXME: should simply be a signed byte.
    p('B', 'turnSpeedup', {
      tx: (v: number) => v + 50,
      rx: (v: number) => v - 50,
    });
    p('B', 'shells');
    p('B', 'mines');
    p('B', 'trees');
    p('B', 'reload');
    p('B', 'firingRange', {
      tx: (v: number) => v * 2,
      rx: (v: number) => v / 2,
    });
    p('B', 'waterTimer');
    p('B', 'kills');
    p('B', 'deaths');

    // Group bit fields.
    p('f', 'accelerating');
    p('f', 'braking');
    p('f', 'turningClockwise');
    p('f', 'turningCounterClockwise');
    p('f', 'shooting');
    p('f', 'layingMine');
    p('f', 'onBoat');
  }

  /**
   * Get the 1/16th direction step.
   * FIXME: Should move our angle-related calculations to a separate module or so.
   */
  getDirection16th(): number {
    return round((this.direction - 1) / 16) % 16;
  }

  getSlideDirection16th(): number {
    return round((this.slideDirection - 1) / 16) % 16;
  }

  /**
   * Return an array of pillboxes this tank is carrying.
   */
  getCarryingPillboxes(): any[] {
    return this.world.map.pills.filter((pill: any) => pill.inTank && pill.owner?.$ === this);
  }

  /**
   * Get the tilemap index to draw. This is the index in styled.png.
   */
  getTile(): [number, number] {
    const tx = this.getDirection16th();
    const ty = this.onBoat ? 1 : 0;
    return [tx, ty];
  }

  /**
   * Tell whether the other tank is an ally.
   */
  isAlly(other: Tank): boolean {
    return other === this || (this.team !== 255 && other.team === this.team);
  }

  /**
   * Adjust the firing range.
   */
  increaseRange(): void {
    this.firingRange = min(7, this.firingRange + 0.5);
  }

  decreaseRange(): void {
    this.firingRange = max(1, this.firingRange - 0.5);
  }

  /**
   * We've taken a hit. Check if we were killed, otherwise slide and possibly kill our boat.
   */
  takeShellHit(shell: Shell): number {
    this.armour -= 5;
    if (this.armour < 0) {
      const largeExplosion = this.shells + this.mines > 20;
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, shell.direction, largeExplosion));
      }
      // Track death and kill statistics
      this.deaths++;
      // Credit the kill to the attacker (via attribution)
      if (shell.attribution && shell.attribution.$ && shell.attribution.$ !== this) {
        shell.attribution.$.kills++;
      }
      this.kill();
    } else {
      this.slideTicks = 8;
      this.slideDirection = shell.direction;
      if (this.onBoat) {
        this.onBoat = false;
        this.speed = 0;
        if (this.cell.isType('^')) this.sink();
      }
    }
    return sounds.HIT_TANK;
  }

  /**
   * We've taken a hit from a mine. Mostly similar to the above.
   */
  takeMineHit(): void {
    this.armour -= 10;
    if (this.armour < 0) {
      const largeExplosion = this.shells + this.mines > 20;
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, this.direction, largeExplosion));
      }
      // Track death from mine
      this.deaths++;
      // TODO: Track who placed the mine for kill attribution
      this.kill();
    } else if (this.onBoat) {
      this.onBoat = false;
      this.speed = 0;
      if (this.cell.isType('^')) this.sink();
    }
  }

  // World updates

  spawn(team: number): void {
    this.team = team;
    this.reset();
    // Only spawn on server (ClientWorld doesn't have this method)
    if (this.world.spawn) {
      this.ref('builder', this.world.spawn(Builder, this));
    }
  }

  update(): void {
    // Don't update if not spawned yet
    if (!this.cell) return;

    if (this.death()) return;
    this.shootOrReload();
    this.layMine();
    this.turn();
    this.accelerate();
    this.fixPosition();
    this.move();
  }

  destroy(): void {
    this.dropPillboxes();
    // Only destroy on server (ClientWorld doesn't have this method)
    if (this.world.destroy) {
      this.world.destroy(this.builder.$);
    }
  }

  death(): boolean {
    if (this.armour !== 255) return false;

    // Count down ticks from 255, before respawning.
    if (this.world.authority && --this.respawnTimer! === 0) {
      delete this.respawnTimer;
      this.reset();
      return false;
    }

    return true;
  }

  shootOrReload(): void {
    if (this.reload > 0) this.reload--;
    if (!this.shooting || this.reload !== 0 || this.shells <= 0) return;
    // We're clear to fire a shot.

    this.shells--;
    this.reload = 13;
    // Only spawn on server (ClientWorld doesn't have this method)
    if (this.world.spawn) {
      this.world.spawn(Shell, this, { range: this.firingRange, onWater: this.onBoat });
    }
    this.soundEffect(sounds.SHOOTING);
  }

  layMine(): void {
    if (!this.layingMine || this.mines <= 0) return;

    // Get the direction behind the tank (opposite direction)
    const behindDirection = (this.direction + 128) % 256;
    const rad = ((256 - round((behindDirection - 1) / 16) % 16 * 16) * 2 * PI) / 256;

    // Calculate position one tile behind the tank
    const behindX = this.x! + round(cos(rad) * TILE_SIZE_WORLD);
    const behindY = this.y! + round(sin(rad) * TILE_SIZE_WORLD);
    const behindCell = this.world.map.cellAtWorld(behindX, behindY);

    // Check if we can place a mine here (same rules as builder)
    // Cannot place on: bases, pillboxes, water ('^', ' '), walls ('|'), ruins ('}'), boats ('b')
    if (behindCell.base || behindCell.pill || behindCell.mine ||
        behindCell.isType('^', ' ', '|', 'b', '}')) {
      return;
    }

    // Place the mine
    behindCell.setType(null, true, 0);
    this.mines--;
    this.soundEffect(sounds.MAN_LAY_MINE);
  }

  turn(): void {
    // Determine turn rate (increased by 165.6% for tighter turning).
    const maxTurn = this.cell.getTankTurn(this) * 2.6555;

    // Are the key presses cancelling eachother out?
    if (this.turningClockwise === this.turningCounterClockwise) {
      this.turnSpeedup = 0;
      return;
    }

    // Determine angular acceleration, and apply speed-up.
    let acceleration: number;
    if (this.turningCounterClockwise) {
      acceleration = maxTurn;
      if (this.turnSpeedup < 10) acceleration /= 2;
      if (this.turnSpeedup < 0) this.turnSpeedup = 0;
      this.turnSpeedup++;
    } else {
      // if turningClockwise
      acceleration = -maxTurn;
      if (this.turnSpeedup > -10) acceleration /= 2;
      if (this.turnSpeedup > 0) this.turnSpeedup = 0;
      this.turnSpeedup--;
    }

    // Turn the tank.
    this.direction += acceleration;
    // Normalize direction.
    while (this.direction < 0) this.direction += 256;
    if (this.direction >= 256) this.direction %= 256;
  }

  accelerate(): void {
    // Determine acceleration.
    const maxSpeed = this.cell.getTankSpeed(this);
    let acceleration: number;
    // Is terrain forcing us to slow down?
    if (this.speed > maxSpeed) {
      acceleration = -0.25;
    }
    // Are key presses cancelling eachother out?
    else if (this.accelerating === this.braking) {
      acceleration = 0.0;
    }
    // What's does the player want to do?
    else if (this.accelerating) {
      acceleration = 0.25;
    } else {
      acceleration = -0.25; // if braking
    }
    // Adjust speed, and clip as necessary.
    if (acceleration > 0.0 && this.speed < maxSpeed) {
      this.speed = min(maxSpeed, this.speed + acceleration);
    } else if (acceleration < 0.0 && this.speed > 0.0) {
      this.speed = max(0.0, this.speed + acceleration);
    }
  }

  fixPosition(): void {
    // Check to see if there's a solid underneath the tank. This could happen if some other player
    // builds underneath us. In that case, we try to nudge the tank off the solid.
    if (this.cell.getTankSpeed(this) === 0) {
      const halftile = TILE_SIZE_WORLD / 2;
      if (this.x! % TILE_SIZE_WORLD >= halftile) this.x!++;
      else this.x!--;
      if (this.y! % TILE_SIZE_WORLD >= halftile) this.y!++;
      else this.y!--;
      this.speed = max(0.0, this.speed - 1);
    }

    // Also check if we're on top of another tank.
    for (const other of this.world.tanks) {
      if (other !== this && other.armour !== 255) {
        if (distance(this as any, other) <= 255) {
          // FIXME: winbolo actually does an increasing size of nudges while the tanks are colliding,
          // keeping a static/global variable. But perhaps this should be combined with tank sliding?
          if (other.x! < this.x!) this.x!++;
          else this.x!--;
          if (other.y! < this.y!) this.y!++;
          else this.y!--;
        }
      }
    }
  }

  move(): void {
    let dx = 0,
      dy = 0;
    // FIXME: Our angle unit should match more closely that of JavaScript.
    if (this.speed > 0) {
      const rad = ((256 - this.getDirection16th() * 16) * 2 * PI) / 256;
      dx += round(cos(rad) * ceil(this.speed));
      dy += round(sin(rad) * ceil(this.speed));
    }
    if (this.slideTicks > 0) {
      const rad = ((256 - this.getSlideDirection16th() * 16) * 2 * PI) / 256;
      dx += round(cos(rad) * 16);
      dy += round(sin(rad) * 16);
      this.slideTicks--;
    }
    const newx = this.x! + dx;
    const newy = this.y! + dy;

    let slowDown = true;

    // Check if we're running into an obstacle in either axis direction.
    if (dx !== 0) {
      const ahead = dx > 0 ? newx + 64 : newx - 64;
      const aheadCell = this.world.map.cellAtWorld(ahead, newy);
      if (aheadCell.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!this.onBoat || aheadCell.isType(' ', '^') || this.speed >= 16) {
          this.x = newx;
        }
      }
    }

    if (dy !== 0) {
      const ahead = dy > 0 ? newy + 64 : newy - 64;
      const aheadCell = this.world.map.cellAtWorld(newx, ahead);
      if (aheadCell.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!this.onBoat || aheadCell.isType(' ', '^') || this.speed >= 16) {
          this.y = newy;
        }
      }
    }

    if (dx !== 0 || dy !== 0) {
      // If we're completely obstructed, reduce our speed.
      if (slowDown) {
        this.speed = max(0.0, this.speed - 1);
      }

      // Update the cell reference.
      const oldcell = this.cell;
      this.updateCell();

      // Check our new terrain if we changed cells.
      if (oldcell !== this.cell) this.checkNewCell(oldcell);
    }

    if (!this.onBoat && this.speed <= 3 && this.cell.isType(' ')) {
      if (++this.waterTimer === 15) {
        if (this.shells !== 0 || this.mines !== 0) {
          this.soundEffect(sounds.BUBBLES);
        }
        this.shells = max(0, this.shells - 1);
        this.mines = max(0, this.mines - 1);
        this.waterTimer = 0;
      }
    } else {
      this.waterTimer = 0;
    }
  }

  checkNewCell(oldcell: any): void {
    // FIXME: check for mine impact
    // FIXME: Reveal hidden mines nearby

    // Check if we just entered or left the water.
    if (this.onBoat) {
      if (!this.cell.isType(' ', '^')) this.leaveBoat(oldcell);
    } else {
      if (this.cell.isType('^')) {
        this.sink();
        return;
      }
      if (this.cell.isType('b')) this.enterBoat();
    }

    if (this.cell.mine) {
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.world.spawn(MineExplosion, this.cell);
      }
    }
  }

  leaveBoat(oldcell: any): void {
    // Check if we're running over another boat; destroy it if so.
    if (this.cell.isType('b')) {
      // Don't need to retile surrounding cells for this.
      this.cell.setType(' ', false, 0);
      // Create a small explosion at the center of the tile.
      const x = (this.cell.x + 0.5) * TILE_SIZE_WORLD;
      const y = (this.cell.y + 0.5) * TILE_SIZE_WORLD;
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.world.spawn(Explosion, x, y);
      }
      this.world.soundEffect(sounds.SHOT_BUILDING, x, y);
    } else {
      // Leave a boat if we were on a river.
      if (oldcell.isType(' ')) {
        // Don't need to retile surrounding cells for this.
        oldcell.setType('b', false, 0);
      }
      this.onBoat = false;
    }
  }

  enterBoat(): void {
    // Don't need to retile surrounding cells for this.
    this.cell.setType(' ', false, 0);
    this.onBoat = true;
  }

  sink(): void {
    this.world.soundEffect(sounds.TANK_SINKING, this.x, this.y);
    // Track death from sinking
    this.deaths++;
    // FIXME: Somehow blame a killer, if instigated by a shot?
    this.kill();
  }

  kill(): void {
    // FIXME: Message the other players. Probably want a scoreboard too.
    this.dropPillboxes();
    this.x = this.y = null;
    this.armour = 255;
    // The respawnTimer attribute exists only on the server.
    // It is deleted once the timer is triggered, which happens in death().
    this.respawnTimer = 255;
  }

  /**
   * Drop all pillboxes we own in a neat square area.
   */
  dropPillboxes(): void {
    const pills = this.getCarryingPillboxes();
    if (pills.length === 0) return;

    // Safety check: if tank doesn't have a valid cell, can't drop pillboxes
    if (!this.cell) return;

    let x = this.cell.x;
    const sy = this.cell.y;
    const width = round(sqrt(pills.length));
    const delta = floor(width / 2);
    x -= delta;
    const ey = sy + width;

    while (pills.length !== 0) {
      for (let y = sy; y < ey; y++) {
        const cell = this.world.map.cellAtTile(x, y);
        if (cell.base || cell.pill || cell.isType('|', '}', 'b')) continue;
        const pill = pills.pop();
        if (!pill) return;
        pill.placeAt(cell);
      }
      x += 1;
    }
  }
}

export default Tank;
