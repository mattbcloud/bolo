import { NetWorldObject } from './villain/world/net/object';
/**
 * The base class for all world objects in Bolo.
 */
export class BoloObject extends NetWorldObject {
    constructor() {
        super(...arguments);
        /**
         * Whether objects of this class are drawn using the regular 'base' tilemap, or the styled
         * tilemap. May also be `null`, in which case the object is not drawn at all.
         */
        this.styled = null;
        /**
         * Styled objects should set their `team` attribute to the appropriate team number in order to
         * get the team color styling.
         * Note: Declared by subclasses - some use properties, others use getters/setters for debugging
         */
        // team is intentionally not declared here to allow subclasses to define it as property or accessor
        /**
         * These are properties containing the world coordinates of this object. The value `null` for
         * either means that the object is not physical or 'not in the world' at this moment
         * (ie. dead tanks).
         */
        this.x = null;
        this.y = null;
    }
    /**
     * Emit a sound effect from this object's location.
     */
    soundEffect(sfx) {
        this.world.soundEffect(sfx, this.x, this.y, this);
    }
    // Abstract methods
    /**
     * Return the (x,y) index in the tilemap (base or styled, selected above) that the object should
     * be drawn with. May be a no-op if the object is never actually drawn.
     */
    getTile() { }
}
export default BoloObject;
//# sourceMappingURL=object.js.map