/**
 * Builder - The little man that comes out of tanks to build things
 */
import BoloObject from '../object';
export type BuilderAction = 'forest' | 'road' | 'repair' | 'boat' | 'building' | 'pillbox' | 'mine';
export declare class Builder extends BoloObject {
    styled: boolean;
    team: number | null;
    states: {
        inTank: number;
        waiting: number;
        returning: number;
        parachuting: number;
        actions: {
            _min: number;
            forest: number;
            road: number;
            repair: number;
            boat: number;
            building: number;
            pillbox: number;
            mine: number;
        };
    };
    order: number;
    x: number | null;
    y: number | null;
    targetX: number;
    targetY: number;
    trees: number;
    hasMine: boolean;
    waitTimer: number;
    animation: number;
    cell: any;
    owner?: any;
    pillbox?: any;
    /**
     * Builders are only ever spawned and destroyed on the server.
     */
    constructor(world: any);
    /**
     * Helper, called in several places that change builder position.
     */
    updateCell(): void;
    serialization(isCreate: boolean, p: Function): void;
    getTile(): [number, number];
    performOrder(action: BuilderAction, trees: number, cell: any): void;
    kill(): void;
    spawn(owner: any): void;
    anySpawn(): void;
    update(): void;
    move(target: any, targetRadius: number, boatRadius: number): void;
    reached(): void;
    parachutingIn(target: {
        x: number;
        y: number;
    }): void;
}
export default Builder;
//# sourceMappingURL=builder.d.ts.map