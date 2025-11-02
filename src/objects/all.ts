/**
 * Export all game objects
 */

export { Builder } from './builder';
export { Explosion } from './explosion';
export { Fireball } from './fireball';
export { FloodFill } from './flood_fill';
export { MineExplosion } from './mine_explosion';
export { Shell } from './shell';
export { Tank } from './tank';
export { WorldBase } from './world_base';
export { WorldPillbox } from './world_pillbox';

import { WorldPillbox } from './world_pillbox';
import { WorldBase } from './world_base';
import { FloodFill } from './flood_fill';
import { Tank } from './tank';
import { Explosion } from './explosion';
import { MineExplosion } from './mine_explosion';
import { Shell } from './shell';
import { Fireball } from './fireball';
import { Builder } from './builder';

export function registerWithWorld(w: any): void {
  w.registerType(WorldPillbox);
  w.registerType(WorldBase);
  w.registerType(FloodFill);
  w.registerType(Tank);
  w.registerType(Explosion);
  w.registerType(MineExplosion);
  w.registerType(Shell);
  w.registerType(Fireball);
  w.registerType(Builder);
}
