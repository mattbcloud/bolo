/**
 * The base is a map object, and thus a slightly special case of world object.
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';

const { min, max } = Math;

export class WorldBase extends BoloObject {
  styled: boolean;
  declare _team: number | null;

  get team(): number | null {
    return this._team;
  }

  set team(value: number | null) {
    this._team = value;
  }

  owner_idx: number = 255;
  armour: number;
  shells: number;
  mines: number;
  refueling?: any;
  refuelCounter: number;
  private _regenCounter: number = 0;
  cell: any;
  owner?: any;
  map: any;

  /**
   * This is a MapObject; it is constructed differently on the server.
   */
  constructor(world_or_map: any, x?: number, y?: number, owner_idx?: number, armour?: number, shells?: number, mines?: number) {
    super(arguments.length === 1 ? world_or_map : null);

    this._team = 255;
    this.styled = true;
    this.armour = 0;
    this.shells = 0;
    this.mines = 0;
    this.refuelCounter = 0;

    if (arguments.length > 1) {
      this.map = world_or_map;
      this.x = (x! + 0.5) * TILE_SIZE_WORLD;
      this.y = (y! + 0.5) * TILE_SIZE_WORLD;
      this.owner_idx = owner_idx!;
      // Don't set team here - it's already initialized to 255 via _team property
      // Will be updated by updateOwner() when owner ref is set
      this.armour = armour!;
      this.shells = shells!;
      this.mines = mines!;
      // Override the cell's type.
      world_or_map.cellAtTile(x, y).setType('=', false, -1);
    }

    // Keep track of owner and position changes.
    this.on('netUpdate', (changes: any) => {
      // Get the map reference (either from world or directly)
      const map = this.world?.map || this.map;

      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        // Update cell reference when position changes
        if (this.x != null && this.y != null && map) {
          this.cell = map.cellAtWorld(this.x, this.y);
          this.cell.base = this;
        }
      }
      // Only update owner-derived fields if team wasn't directly updated
      // (since team is now sent via serialization)
      if (changes.hasOwnProperty('owner') && !changes.hasOwnProperty('team')) {
        this.updateOwner();
      }
      // Retile when team changes
      if (changes.hasOwnProperty('team')) {
        this.cell?.retile();
      }
    });
  }

  /**
   * The state information to synchronize.
   */
  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }

    p('O', 'owner');
    p('B', 'owner_idx');
    p('B', 'team');
    p('O', 'refueling');
    // Always send refuelCounter to avoid desync when refueling object reference
    // can't be resolved yet on the client (object may not exist in client's array yet)
    p('B', 'refuelCounter');
    p('B', 'armour');
    p('B', 'shells');
    p('B', 'mines');
  }

  /**
   * True if the base's owning team currently has at least one live tank in the game.
   *
   * When FALSE the base is effectively abandoned (its team disconnected / has no members):
   * per the Bolo rule the armour gate is lifted so ANY tank can drive across and claim it,
   * without first shooting it down. Relying on the `owner` ref being nulled on disconnect was
   * fragile — a base that kept a stale owner ref stayed gated forever (one base un-claimable
   * while siblings claimed fine). Checking live team membership directly is robust to that.
   */
  ownerTeamHasMembers(): boolean {
    const t = this._team;
    if (t == null || t === 255) return false;
    const tanks = this.world?.tanks ?? this.map?.world?.tanks ?? [];
    for (const tank of tanks) {
      if (tank.armour !== 255 && tank.team === t) return true;
    }
    return false;
  }

  /**
   * Helper for common stuff to do when the owner changes.
   */
  updateOwner(): void {
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
    }
    // Don't reset owner_idx or team when owner becomes null
    // These values are now sent directly via serialization and should persist
    // The owner reference can be temporarily null during serialization/deserialization
    this.cell?.retile();
  }

  /**
   * Get the tilemap index to draw. This is the index in styled.png.
   */
  getTile(): [number, number] {
    return [16, 0];
  }

  // World updates

  spawn(): void {
    // No-op for bases - initialization is handled in anySpawn
  }

  anySpawn(): void {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    this.cell.base = this;
  }

  update(): void {
    // ALL base logic — resource regen, claiming (findSubject), and refuel transfer —
    // mutates authoritative game state and must run ONLY on the server. The client
    // receives team / owner / armour / refueling via serialization. Without this gate
    // the client (authority=false) also ran findSubject() each tick and independently
    // claimed the base, then got corrected by the next server sync → the base ownership
    // rapidly FLICKERED between the claimer's colour and the real owner. (Regen was
    // already authority-gated; the claim + transfer were not — that was the bug.)
    if (!this.world.authority) return;

    // Base resource regeneration. All three resources regenerate independently in
    // parallel so a depleted base is playable again within ~90 seconds (1 unit/sec ×
    // 90 max capacity). REGEN_INTERVAL: 50 ticks × 20 ms/tick = 1 unit per second.
    {
      const REGEN_INTERVAL = 50;
      const MAX_ARMOUR = 90;
      const MAX_SHELLS = 90;
      const MAX_MINES  = 90;

      if (++this._regenCounter >= REGEN_INTERVAL) {
        this._regenCounter = 0;
        if (this.armour < MAX_ARMOUR) this.armour++;
        if (this.shells < MAX_SHELLS) this.shells++;
        if (this.mines  < MAX_MINES)  this.mines++;
      }
    }

    // Check if we should clear the refueling reference
    if (this.refueling) {
      const tankCell = this.refueling.$.cell;
      const tankArmour = this.refueling.$.armour;
      const shouldClear = (tankCell !== this.cell || tankArmour === 255);

      if (shouldClear) {
        this.ref('refueling', null);
      }
    }

    if (!this.refueling) {
      this.findSubject();
      return;
    }

    if (--this.refuelCounter !== 0) return;

    // We're clear to transfer some resources to the tank.
    if (this.armour > 0 && this.refueling.$.armour < 40) {
      const amount = min(5, this.armour, 40 - this.refueling.$.armour);
      this.refueling.$.armour += amount;
      this.armour -= amount;
      this.refuelCounter = 46;
    } else if (this.shells > 0 && this.refueling.$.shells < 40) {
      this.refueling.$.shells += 1;
      this.shells -= 1;
      this.refuelCounter = 7;
    } else if (this.mines > 0 && this.refueling.$.mines < 40) {
      this.refueling.$.mines += 1;
      this.mines -= 1;
      this.refuelCounter = 7;
    } else {
      this.refuelCounter = 1;
    }
  }

  /**
   * Look for someone to refuel, and check if he's claiming us too. Be careful to prevent rapid
   * reclaiming if two tanks are on the same tile.
   */
  findSubject(): void {
    const tanks = this.world.tanks.filter(
      (tank: any) => tank.armour !== 255 && tank.cell === this.cell
    );

    for (const tank of tanks) {
      // Check if tank is an ally (same team) or if base is unclaimed (team 255)
      const isAlly = this.team !== 255 && tank.team === this.team;

      if (isAlly) {
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        let canClaim = true;
        for (const other of tanks) {
          if (other !== tank) {
            if (!tank.isAlly(other)) canClaim = false;
          }
        }
        if (canClaim) {
          // Pre-set owner_idx and team BEFORE ref() so the very first
          // serialisation sent to clients already has the correct colour.
          // Without this, ref('owner', tank) sends an intermediate packet
          // with the new owner but the old team/idx, causing a visible flicker
          // when claiming a base that belonged to a disconnected team.
          this.owner_idx = tank.tank_idx;
          this.team      = tank.team;
          this.ref('owner', tank);
          this.updateOwner(); // re-applies owner_idx/team + triggers retile
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        }
      }
    }
  }

  takeShellHit(shell: any): number {
    if (this.owner) {
      for (const pill of this.world.map.pills) {
        if (!pill.inTank && !pill.carried && pill.armour > 0) {
          if (pill.owner?.$.isAlly(this.owner.$) && distance(this as any, pill) <= 2304) {
            pill.aggravate();
          }
        }
      }
    }
    this.armour = max(0, this.armour - 5);
    return sounds.SHOT_BUILDING;
  }
}

export default WorldBase;
