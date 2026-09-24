export interface Point {
  x: number
  y: number
}

/**
 * Converts polar coordinates to SVG cartesian coordinates.
 * Angles are in degrees, clockwise from 12 o'clock (so 0° is up, 90° is right).
 */
export function polarToCartesian(radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) }
}

/** SVG path for a ring segment between two radii and two angles. */
export function annularSectorPath(
  innerRadius: number,
  outerRadius: number,
  startDeg: number,
  endDeg: number,
): string {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  const o1 = polarToCartesian(outerRadius, startDeg)
  const o2 = polarToCartesian(outerRadius, endDeg)
  const i1 = polarToCartesian(innerRadius, endDeg)
  const i2 = polarToCartesian(innerRadius, startDeg)
  const f = (n: number) => n.toFixed(2)
  return [
    `M ${f(o1.x)} ${f(o1.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${f(o2.x)} ${f(o2.y)}`,
    `L ${f(i1.x)} ${f(i1.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${f(i2.x)} ${f(i2.y)}`,
    'Z',
  ].join(' ')
}
