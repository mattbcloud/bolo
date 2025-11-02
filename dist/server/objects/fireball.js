/**
 * A fireball is the trail of fire left by a dying tank.
 */
import * as sounds from '../sounds';
import BoloObject from '../object';
import Explosion from './explosion';
const { round, cos, sin, PI } = Math;
export class Fireball extends BoloObject {
    constructor() {
        super(...arguments);
        this.styled = null;
        this.direction = 0;
        this.largeExplosion = false;
        this.lifespan = 0;
    }
    serialization(isCreate, p) {
        if (isCreate) {
            p('B', 'direction');
            p('f', 'largeExplosion');
        }
        p('H', 'x');
        p('H', 'y');
        p('B', 'lifespan');
    }
    /**
     * Get the 1/16th direction step.
     */
    getDirection16th() {
        return round((this.direction - 1) / 16) % 16;
    }
    // World updates
    spawn(x, y, direction, largeExplosion) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.largeExplosion = largeExplosion;
        this.lifespan = 80;
    }
    update() {
        if (this.lifespan-- % 2 === 0) {
            if (this.wreck())
                return;
            this.move();
        }
        if (this.lifespan === 0) {
            this.explode();
            // Only destroy on server (ClientWorld doesn't have this method)
            if (this.world.destroy) {
                this.world.destroy(this);
            }
        }
    }
    wreck() {
        // Only spawn/destroy on server (ClientWorld doesn't have these methods)
        if (this.world.spawn) {
            this.world.spawn(Explosion, this.x, this.y);
        }
        const cell = this.world.map.cellAtWorld(this.x, this.y);
        if (cell.isType('^')) {
            if (this.world.destroy) {
                this.world.destroy(this);
            }
            this.soundEffect(sounds.TANK_SINKING);
            return true;
        }
        else if (cell.isType('b')) {
            cell.setType(' ');
            this.soundEffect(sounds.SHOT_BUILDING);
        }
        else if (cell.isType('#')) {
            cell.setType('.');
            this.soundEffect(sounds.SHOT_TREE);
        }
        return false;
    }
    move() {
        if (this.dx === undefined) {
            const radians = ((256 - this.direction) * 2 * PI) / 256;
            this.dx = round(cos(radians) * 48);
            this.dy = round(sin(radians) * 48);
        }
        const { dx, dy } = this;
        const newx = this.x + dx;
        const newy = this.y + dy;
        if (dx !== 0) {
            const ahead = dx > 0 ? newx + 24 : newx - 24;
            const aheadCell = this.world.map.cellAtWorld(ahead, newy);
            if (!aheadCell.isObstacle())
                this.x = newx;
        }
        if (dy !== 0) {
            const ahead = dy > 0 ? newy + 24 : newy - 24;
            const aheadCell = this.world.map.cellAtWorld(newx, ahead);
            if (!aheadCell.isObstacle())
                this.y = newy;
        }
    }
    explode() {
        const cells = [this.world.map.cellAtWorld(this.x, this.y)];
        if (this.largeExplosion) {
            const dx = this.dx > 0 ? 1 : -1;
            const dy = this.dy > 0 ? 1 : -1;
            cells.push(cells[0].neigh(dx, 0));
            cells.push(cells[0].neigh(0, dy));
            cells.push(cells[0].neigh(dx, dy));
            this.soundEffect(sounds.BIG_EXPLOSION);
        }
        else {
            this.soundEffect(sounds.MINE_EXPLOSION);
        }
        for (const cell of cells) {
            cell.takeExplosionHit();
            for (const tank of this.world.tanks) {
                const builder = tank.builder?.$;
                if (builder) {
                    const { inTank, parachuting } = builder.states;
                    if (builder.order !== inTank && builder.order !== parachuting) {
                        if (builder.cell === cell)
                            builder.kill();
                    }
                }
            }
            // Only spawn on server (ClientWorld doesn't have this method)
            if (this.world.spawn) {
                const [x, y] = cell.getWorldCoordinates();
                this.world.spawn(Explosion, x, y);
            }
        }
    }
}
export default Fireball;
//# sourceMappingURL=fireball.js.map