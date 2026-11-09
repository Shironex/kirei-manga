/**
 * The ribbon's course as a curve, shared by the ribbon mesh and the camera
 * rig: the camera travels along it from prop to prop.
 */
import { CatmullRomCurve3, Vector3 } from 'three';

export function createRibbonCurve(points: readonly Vector3[]): CatmullRomCurve3 {
  return new CatmullRomCurve3(
    points.map(p => p.clone()),
    false,
    'centripetal'
  );
}

/** The arc length parameter (0 to 1) of the curve point nearest `target`, on the desk plane. */
export function nearestU(curve: CatmullRomCurve3, target: Vector3, samples = 400): number {
  const p = new Vector3();
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    const d = (p.x - target.x) ** 2 + (p.z - target.z) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = u;
    }
  }
  return best;
}
