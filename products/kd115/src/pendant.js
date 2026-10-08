import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// KD-115 pear pendant (Karma CAD sheet, 18 Aug 2026). Pure geometry (no DOM): runs headless in Node.
// Pendant frame: x across, y up (pear point up), z toward the viewer. Origin = centre of the pear's round end.

// Pear girdle outline. Round end: radius W/2 below the centre. Above it the half-width follows a "shouldered" curve
// w(y) = W/2 * (1 - (y/T)^P), T = L - W/2: smooth into the round end (zero slope at y = 0) and pointed at the tip with
// half-angle atan(P * (W/2) / T). P_STRAIGHT = 0 means the straight-sided (tangent) teardrop instead.
// Distance from the circle centre to the outline along direction phi (phi = 0 points at the tip, +y), by bisection.
export function pearRadius(phi, W = 2, L = 4, P = 2.33) {
  const r = W / 2, T = L - r;
  const inside = (x, y) => {
    if (y <= 0) return x * x + y * y <= r * r;
    if (P > 0) return y <= T && Math.abs(x) <= r * (1 - Math.pow(y / T, P));
    const a = Math.acos(r / T), ty = r * Math.cos(a), tx = r * Math.sin(a);               // straight-sided teardrop
    if (y <= ty) return x * x + y * y <= r * r;
    return y <= T && Math.abs(x) <= tx * (T - y) / (T - ty);
  };
  const dx = Math.sin(phi), dy = Math.cos(phi);
  let lo = 0, hi = T + r;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (inside(mid * dx, mid * dy)) lo = mid; else hi = mid; }
  return lo;
}

// Pear brilliant: the round 57-facet brilliant (axis y, table up) warped radially in its girdle plane so the girdle
// follows the teardrop. Facet structure is kept; the stone is then rotated so its table faces +z and its tip points +y.
export function pearBrilliant(roundGeo, W = 2, L = 4, SHP = 2.33) {   // SHP: shoulder exponent (0 = straight-sided)
  const g = roundGeo.clone(), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), rho = Math.hypot(x, z);
    if (rho < 1e-9) continue;
    const phi = Math.atan2(x, -z);                                       // phi = 0 along -z (becomes +y after rotation)
    const k = pearRadius(phi, W, L, SHP) / (W / 2);
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  g.rotateX(Math.PI / 2);                                                // axis y -> z (table toward the viewer); -z -> +y (tip up)
  g.computeVertexNormals();
  return g;
}

// Pear outline polygon (x, y) at a given outward offset, for the collar.
export function pearOutline(off, n = 96, W = 2, L = 4, SHP = 2.33) {
  const pts = [];
  for (let k = 0; k < n; k++) { const phi = 2 * Math.PI * k / n, r = pearRadius(phi, W, L, SHP) + off; pts.push(new THREE.Vector2(r * Math.sin(phi), r * Math.cos(phi))); }
  return pts;
}

// Collar: pear-shaped wall around the stone running back to a back plate (side view: solid body behind the stone).
export function collarGeometry(c) {
  // c: { WALL, Z_FRONT, Z_BACK, BACK_T, N? }
  // 2026-10-06: smooth shading. ExtrudeGeometry shades each wall strip flat, so the curved side read as stacked
  // rectangles; creased normals smooth the curve while the rim and back edges (90 deg) stay crisp. Finer outline too.
  const CLEAR = 0.02, N = c.N || 192;                                    // seat clearance: inner wall must not coincide
  const outer = new THREE.Shape(pearOutline(c.WALL + CLEAR, N));          // with the girdle (coincident surfaces flicker)
  const hole = new THREE.Path(pearOutline(CLEAR, N).reverse()); outer.holes.push(hole);
  const wall = new THREE.ExtrudeGeometry(outer, { depth: c.Z_FRONT - c.Z_BACK - c.BACK_T, bevelEnabled: false, curveSegments: 1 });
  wall.translate(0, 0, c.Z_BACK + c.BACK_T);
  const back = new THREE.ExtrudeGeometry(new THREE.Shape(pearOutline(c.WALL + CLEAR, N)), { depth: c.BACK_T, bevelEnabled: false, curveSegments: 1 });
  back.translate(0, 0, c.Z_BACK);
  const flat = g => (g.index ? g.toNonIndexed() : g);                     // extrusions are already non-indexed (avoids a console warning)
  const merged = mergeGeometries([flat(wall), flat(back)].map(g => { g.deleteAttribute('uv'); return g; }));
  return toCreasedNormals(merged, THREE.MathUtils.degToRad(40));
}

// V-claw: a chevron capping the pear's tip, extruded back through the full depth (top view: two walls running back).
export function vClawGeometry(v) {
  // v: { TIP_Y (outer apex), ARM_DX, ARM_DY, T (arm thickness), Z_FRONT, Z_BACK }
  const s = new THREE.Shape();
  s.moveTo(0, v.TIP_Y); s.lineTo(v.ARM_DX, v.TIP_Y - v.ARM_DY); s.lineTo(v.ARM_DX - v.T, v.TIP_Y - v.ARM_DY);
  s.lineTo(0, v.TIP_Y - v.T * 1.25); s.lineTo(-v.ARM_DX + v.T, v.TIP_Y - v.ARM_DY); s.lineTo(-v.ARM_DX, v.TIP_Y - v.ARM_DY); s.lineTo(0, v.TIP_Y);
  const g = new THREE.ExtrudeGeometry(s, { depth: v.Z_FRONT - v.Z_BACK, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelOffset: -0.04, bevelSegments: 2 });
  g.translate(0, 0, v.Z_BACK);
  return toCreasedNormals(g, Math.PI / 4);
}
