/**
 * Hidden mines, a game option. Classic Bolo always played this way (Stuart Cheshire's manual and
 * FAQ): mines are invisible to everyone except the player who laid them and their allies, with
 * two exceptions:
 *
 *   - "If you drop a mine out of the back of the tank, and there is an enemy close to you, then
 *     they see it." Mines laid by the man stay secret even from someone watching.
 *   - "Your tank can detect invisible mines up to one map square in front of it."
 *
 * Once a player has seen a mine it stays on their map. Mines in the map file belong to nobody,
 * so they are hidden from everyone until found.
 *
 * This is decided on the server, which tells each player only about the mines they may see: a
 * hidden mine never reaches a player's game at all. The server keeps who laid each mine (team) and
 * who has seen it on the map cell itself (`mineTeam`, `mineSeenBy`), server-side only.
 */

import { TILE_SIZE_WORLD } from '../constants';

/** An enemy within this many tiles of a tank dropping a mine sees it. */
export const MINE_SEEN_NEAR_TILES = 8;

/** Whether `tank`'s player may see the mine on `cell` (false if there is no mine). */
export function mineVisibleTo(cell: any, tank: any): boolean {
  if (!cell.mine) return false;
  if (cell.isEdgeCell()) return true;                  // the mined sea round the map: always shown
  if (cell.mineTeam != null && cell.mineTeam === tank.team) return true;
  return !!cell.mineSeenBy?.has(tank);
}

export class HiddenMines {
  /** Mines each tank's player has newly seen since the last send. */
  private revealed = new Map<any, Set<any>>();

  /**
   * A mine was laid on `cell` by `tank`'s team: dropped from the tank's back (`dropped`), or
   * buried by its builder. A dropped mine is seen by any enemy within MINE_SEEN_NEAR_TILES.
   */
  laid(cell: any, tank: any, dropped: boolean, tanks: any[]): void {
    cell.mineTeam = tank.team;
    cell.mineSeenBy = new Set();
    if (!dropped) return;
    const near = MINE_SEEN_NEAR_TILES * TILE_SIZE_WORLD;
    for (const other of tanks) {
      if (other === tank || other.armour === 255 || other.team === tank.team) continue;
      if (Math.hypot(other.x - tank.x, other.y - tank.y) <= near) this.reveal(cell, other);
    }
  }

  /** Each live tank finds any hidden mine on the square in front of it. */
  detect(map: any, tanks: any[]): void {
    for (const tank of tanks) {
      if (tank.armour === 255 || tank.x == null) continue;
      const rad = ((256 - tank.getDirection16th() * 16) * 2 * Math.PI) / 256;
      const ahead = map.cellAtWorld(
        tank.x + Math.round(Math.cos(rad) * TILE_SIZE_WORLD),
        tank.y + Math.round(Math.sin(rad) * TILE_SIZE_WORLD)
      );
      if (ahead.mine) this.reveal(ahead, tank);
    }
  }

  /** `tank`'s player has seen the mine on `cell`. */
  reveal(cell: any, tank: any): void {
    if (mineVisibleTo(cell, tank)) return;
    (cell.mineSeenBy ??= new Set()).add(tank);
    let cells = this.revealed.get(tank);
    if (!cells) this.revealed.set(tank, cells = new Set());
    cells.add(cell);
  }

  /** The mines `tank`'s player has newly seen since the last call, still in the ground. */
  takeRevealed(tank: any): any[] {
    const cells = this.revealed.get(tank);
    this.revealed.delete(tank);
    return cells ? [...cells].filter(c => c.mine) : [];
  }

  /** Forget a tank that has left the game. */
  forget(tank: any): void {
    this.revealed.delete(tank);
  }
}

/** Every mine on `map` that `tank`'s player may see, apart from the mined sea round the edge. */
export function minesVisibleTo(map: any, tank: any): any[] {
  const out: any[] = [];
  map.each((cell: any) => {
    if (cell.mine && !cell.isEdgeCell() && mineVisibleTo(cell, tank)) out.push(cell);
  });
  return out;
}
