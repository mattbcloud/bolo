/**
 * World mixin
 *
 * Common logic between all bolo world classes.
 */

export interface BoloWorldMixin {
  tanks: any[];
  authority: boolean;
  map: any;

  boloInit(): void;
  addTank(tank: any): void;
  removeTank(tank: any): void;
  getAllMapObjects(): any[];
  spawnMapObjects(): void;
  resolveMapObjectOwners(): void;
  insert(obj: any): void;
}

export const BoloWorldMixin = {
  // Player management

  /**
   * If only we could extend constructors using mixins.
   */
  boloInit(this: any): void {
    this.tanks = [];
  },

  addTank(this: any, tank: any): void {
    tank.tank_idx = this.tanks.length;
    this.tanks.push(tank);
    if (this.authority) this.resolveMapObjectOwners();
    // Clear empty timer when first player joins
    if (this.tanks.length === 1 && this.emptyStartTime !== undefined) {
      this.emptyStartTime = null;
    }
  },

  removeTank(this: any, tank: any): void {
    const removedIdx = tank.tank_idx;
    this.tanks.splice(tank.tank_idx, 1);

    // Renumber all subsequent tanks
    for (let i = tank.tank_idx; i < this.tanks.length; i++) {
      this.tanks[i].tank_idx = i;
    }

    // Update owner_idx on all map objects to reflect the renumbered tanks
    for (const obj of this.getAllMapObjects()) {
      if (obj.owner_idx !== 255) {
        if (obj.owner_idx === removedIdx) {
          // The owner was the removed tank - clear ownership but preserve team
          // This allows the base to remain claimed by the team even though the specific player left
          obj.owner_idx = 255;
          obj.ref('owner', null);
        } else if (obj.owner_idx > removedIdx) {
          // The owner was a tank with higher index - decrement to match renumbered tank
          obj.owner_idx -= 1;
        }
      }
    }

    if (this.authority) this.resolveMapObjectOwners();
    // Start empty timer when last player leaves
    if (this.tanks.length === 0 && this.emptyStartTime !== undefined) {
      this.emptyStartTime = Date.now();
    }
  },

  // Map helpers

  /**
   * A helper method which returns all map objects.
   */
  getAllMapObjects(this: any): any[] {
    return this.map.pills.concat(this.map.bases);
  },

  /**
   * The special spawning logic for MapObjects. These are created when the map is loaded, which is
   * before the World is created. We emulate `spawn` here for these objects.
   */
  spawnMapObjects(this: any): void {
    for (const obj of this.getAllMapObjects()) {
      obj.world = this;
      this.insert(obj);
      obj.spawn();
      obj.anySpawn();
    }
  },

  /**
   * Resolve pillbox and base owner indices to the actual tanks. This method is only really useful
   * on the server. Because of the way serialization works, the client doesn't get the see invalid
   * owner indices. (As can be seen in `ServerWorld#serialize`.) It is called whenever a player
   * joins or leaves the game.
   */
  resolveMapObjectOwners(this: any): void {
    for (const obj of this.getAllMapObjects()) {
      // Only update owner if tank exists at the given index
      // If owner_idx is 255 (neutral) or invalid, this.tanks[owner_idx] will be undefined
      // and we should NOT overwrite the existing owner reference
      if (obj.owner_idx !== 255 && obj.owner_idx < this.tanks.length) {
        console.log(`[resolveMapObjectOwners] Updating ${obj.constructor.name} idx=${obj.idx} owner to tank ${obj.owner_idx}`);
        obj.ref('owner', this.tanks[obj.owner_idx]);
      } else if (obj.owner_idx === 255 && obj.owner) {
        // If explicitly neutral but has an owner, clear it
        console.log(`[resolveMapObjectOwners] Clearing ${obj.constructor.name} idx=${obj.idx} owner (was tank ${obj.owner.$.tank_idx})`);
        obj.ref('owner', null);
      } else {
        console.log(`[resolveMapObjectOwners] Skipping ${obj.constructor.name} idx=${obj.idx} (owner_idx=${obj.owner_idx}, has owner=${!!obj.owner})`);
      }
      obj.cell?.retile();
    }
  },
};

export default BoloWorldMixin;
