const { sqrt, atan2 } = Math;

/**
 * Extend a source object with the properties of another object (shallow copy).
 * We use this to simulate Node's deprecated `process.mixin`.
 */
export function extend<T extends object, U extends object>(
  object: T,
  properties: U
): T & U {
  for (const key in properties) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      (object as any)[key] = properties[key];
    }
  }
  return object as T & U;
}

/**
 * Calculate the distance between two objects.
 */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the heading from `a` towards `b` in radians.
 */
export function heading(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return atan2(b.y - a.y, b.x - a.x);
}
