/**
 * Extend a source object with the properties of another object (shallow copy).
 * We use this to simulate Node's deprecated `process.mixin`.
 */
export declare function extend<T extends object, U extends object>(object: T, properties: U): T & U;
/**
 * Calculate the distance between two objects.
 */
export declare function distance(a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}): number;
/**
 * Calculate the heading from `a` towards `b` in radians.
 */
export declare function heading(a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}): number;
//# sourceMappingURL=helpers.d.ts.map