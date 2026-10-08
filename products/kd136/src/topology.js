// KD-136 build-time step (Node only, not shipped): constrained Delaunay triangulation of the traced outline + hole with
// rim rings and an interior grid. cdt2d is exact (robust) but ~1.7 s, so the result is precomputed into
// disc_topology.json and the browser only computes heights (disc.js buildSurface).
import cdt2d from 'cdt2d';
import { segDist, inPoly, buildSurface } from './disc.js';

export function buildTopology(c) {
  // c: { outer, hole (CCW [[x,y]...]), T (plateau thickness), RINGS (rim offsets, mm), GRID (mm),
  //      WARP (mid-surface waviness, mm), TVAR (thickness variation, fraction), DENT (front hammer dents, mm), BUMPS: [{x,y,r,h}] }
  const O = c.outer, H = c.hole, rim = c.T / 2;
  const pts = [], dist = [];
  const add = (x, y, d) => { pts.push([x, y]); dist.push(d); };
  // boundary loops (d = 0) and their edges as constraints
  const edges = [];
  O.forEach(([x, y], i) => { add(x, y, 0); edges.push([i, (i + 1) % O.length]); });
  const h0 = pts.length;
  H.forEach(([x, y], i) => { add(x, y, 0); edges.push([h0 + i, h0 + (i + 1) % H.length]); });
  const nBoundary = pts.length;
  // offset rings toward the metal (dense where the rounded rim curves fast)
  const metal = (x, y) => inPoly(x, y, O) && !inPoly(x, y, H);
  const boundaryDist = (x, y) => {
    let m = Infinity;
    for (const L of [O, H]) for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; m = Math.min(m, segDist(x, y, a[0], a[1], b[0], b[1])); }
    return m;
  };
  let dropped = 0;
  for (const [L, sign] of [[O, 1], [H, -1]]) {                  // CCW loops: outer -> metal on the left; hole -> metal on the right
    for (const d of c.RINGS) for (let i = 0; i < L.length; i++) {
      const a = L[(i - 1 + L.length) % L.length], b = L[(i + 1) % L.length], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
      const nx = -ty / tl * sign, ny = tx / tl * sign, x = L[i][0] + nx * d, y = L[i][1] + ny * d;
      const bd = boundaryDist(x, y);
      if (metal(x, y) && Math.abs(bd - d) < 0.03) add(x, y, d); else dropped++;   // drop points where the offset folds (tight curvature)
    }
  }
  // interior grid beyond the rim
  const minD = c.RINGS[c.RINGS.length - 1] + c.GRID * 0.6;
  let xs = O.map(p => p[0]), ys = O.map(p => p[1]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += c.GRID * 0.866) {
    const row = Math.round((y - Math.min(...ys)) / (c.GRID * 0.866));
    for (let x = Math.min(...xs) + (row % 2) * c.GRID / 2; x <= Math.max(...xs); x += c.GRID) {
      if (!metal(x, y)) continue; const bd = boundaryDist(x, y); if (bd > minD) add(x, y, bd);
    }
  }
  // constrained Delaunay triangulation; exterior (outside the outline and inside the hole) removed
  const tris = cdt2d(pts, edges, { exterior: false });
  return { pts, dist, tris, nBoundary, dropped };
}

export function buildDisc(c) { return buildSurface(buildTopology(c), c); }   // Node checks: both steps in one call

// Precomputed topology (constrained Delaunay is ~1.7 s, too slow to run on page load): packed as base64 typed arrays.
export function packTopology(t) {
  const b64 = a => Buffer.from(a.buffer).toString('base64');
  return { n: t.pts.length, nBoundary: t.nBoundary, dropped: t.dropped,
    pts: b64(new Float32Array(t.pts.flat())), dist: b64(new Float32Array(t.dist)), tris: b64(new Uint16Array(t.tris.flat())) };
}
