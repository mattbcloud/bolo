/**
 * An explosion is really just a static animation.
 */
import BoloObject from '../object';
const { floor } = Math;
export class Explosion extends BoloObject {
    constructor() {
        super(...arguments);
        this.styled = false;
        this.lifespan = 0;
    }
    serialization(isCreate, p) {
        if (isCreate) {
            p('H', 'x');
            p('H', 'y');
        }
        p('B', 'lifespan');
    }
    getTile() {
        switch (floor(this.lifespan / 3)) {
            case 7:
                return [20, 3];
            case 6:
                return [21, 3];
            case 5:
                return [20, 4];
            case 4:
                return [21, 4];
            case 3:
                return [20, 5];
            case 2:
                return [21, 5];
            case 1:
                return [18, 4];
            default:
                return [19, 4];
        }
    }
    // World updates
    spawn(x, y) {
        this.x = x;
        this.y = y;
        this.lifespan = 23;
    }
    update() {
        if (this.lifespan-- === 0) {
            // Only destroy on server (ClientWorld doesn't have this method)
            if (this.world.destroy) {
                this.world.destroy(this);
            }
        }
    }
}
export default Explosion;
//# sourceMappingURL=explosion.js.map