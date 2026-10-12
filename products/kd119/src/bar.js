import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// KD-119 curved bar pendant layout. Pure geometry (no DOM). Frame: x right, y up, stones face +z; z = 0 at the front of the
// prong balls. Stones (centres, diameters) come from the CAD front view (CV, 13 stones: 3 x 1.3 mm + 10 x 0.8 mm).

// Shared prongs: in each gap between neighbouring stones, one prong above and one below the line, plus a pair at each end.
// Each prong is a straight rod front-to-back with a ball at the front (CAD perspective + side views).
export function prongLayout(stones, k = 0.86) {
  const P = [], n = stones.length, ctr = i => new THREE.Vector2(stones[i][0], stones[i][1]);
  const normalAt = (a, b) => { const t = b.clone().sub(a).normalize(); return new THREE.Vector2(-t.y, t.x); };   // left of a->b (up for a smile)
  for (let i = 0; i < n - 1; i++) {
    const a = ctr(i), b = ctr(i + 1), m = a.clone().add(b).multiplyScalar(0.5), nn = normalAt(a, b);
    const off = k * (stones[i][2] + stones[i + 1][2]) / 4;                                // ~ the mean radius
    P.push(m.clone().addScaledVector(nn, off), m.clone().addScaledVector(nn, -off));
  }
  for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {                                           // end pairs, on the outer side
    const a = ctr(i), b = ctr(j), t = a.clone().sub(b).normalize(), nn = new THREE.Vector2(-t.y, t.x), r = stones[i][2] / 2;
    const base = a.clone().addScaledVector(t, r * 0.55);
    P.push(base.clone().addScaledVector(nn, r * 0.95), base.clone().addScaledVector(nn, -r * 0.95));
  }
  return P;
}
export function prongsGeometry(pts, q) {
  // q: { WIRE, BALL, Z_BACK }   rods from Z_BACK to the ball centre at z = -BALL (ball fronts at z = 0)
  const parts = [];
  for (const p of pts) {
    const len = -q.BALL - q.Z_BACK, c = new THREE.CylinderGeometry(q.WIRE, q.WIRE, len, 16, 1, true); c.rotateX(Math.PI / 2); c.translate(p.x, p.y, q.Z_BACK + len / 2);
    const b = new THREE.SphereGeometry(q.BALL, 20, 14); b.translate(p.x, p.y, -q.BALL);
    const e = new THREE.SphereGeometry(q.WIRE, 12, 8); e.translate(p.x, p.y, q.Z_BACK);
    parts.push(c, b, e);
  }
  return mergeGeometries(parts.map(g => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
}
// Bails (2026-10-09, CAD-MEASURED): an elongated loop at each end, running from behind the end stone's centre up to the
// piece's corner (front view: ~2.3 mm long, seen edge-on and tilted along the curve's end; side view: 1.42 mm wide, face-on).
// A stadium-shaped tube in the plane spanned by the end direction t and z.
class Stadium extends THREE.Curve {
  constructor(rho, len) { super(); this.rho = rho; this.len = len; this.L = 2 * len + 2 * Math.PI * rho; }
  getPoint(u, v = new THREE.Vector3()) {                  // in (t, w) coordinates: t along the loop's length, w across (-> z)
    let s = u * this.L; const r = this.rho, h = this.len / 2;
    if (s < this.len) return v.set(-h + s, r, 0);
    if ((s -= this.len) < Math.PI * r) { const a = s / r; return v.set(h + r * Math.sin(a), r * Math.cos(a), 0); }
    if ((s -= Math.PI * r) < this.len) return v.set(h - s, -r, 0);
    s -= this.len; const a = s / r; return v.set(-h - r * Math.sin(a), -r * Math.cos(a), 0);
  }
}
export function bailsGeometry(bails, b) {
  // bails: { left|right: { dir: [x, y] (measured axis, toward the tip), tip: [x, y] } } (CAD-MEASURED front view)
  // b: { LEN_OUT (2.3), W_OUT (1.42), BAND (0.33: side view, outer 1.42 / hole 0.75), THICK (0.87: front view, edge-on), Z, BEVEL }
  // A flat band: stadium outline with a stadium hole, extruded THICK across (normal to the loop's plane), edges lightly rounded.
  // (A round-wire loop tilted to match the 0.87 mm front width showed its hole from the front; the CAD's bails look solid there.)
  const stadium = (len, half) => { const sh = new THREE.Shape(), h = len / 2 - half;
    sh.moveTo(-h, -half); sh.lineTo(h, -half); sh.absarc(h, 0, half, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(-h, half); sh.absarc(-h, 0, half, Math.PI / 2, 3 * Math.PI / 2, false); return sh; };
  const parts = [];
  for (const side of ['left', 'right']) {
    const outer = stadium(b.LEN_OUT - 2 * b.BEVEL, b.W_OUT / 2 - b.BEVEL), hole = stadium(b.LEN_OUT - 2 * b.BAND - 2 * b.BEVEL + 4 * b.BEVEL, b.W_OUT / 2 - b.BAND + b.BEVEL);
    outer.holes.push(new THREE.Path(hole.getPoints(48).reverse()));
    const g = new THREE.ExtrudeGeometry(outer, { depth: b.THICK - 2 * b.BEVEL, bevelEnabled: true, bevelThickness: b.BEVEL, bevelSize: b.BEVEL, bevelSegments: 3, curveSegments: 24 });
    g.translate(0, 0, -(b.THICK - 2 * b.BEVEL) / 2);
    const t = new THREE.Vector3(bails[side].dir[0], bails[side].dir[1], 0).normalize(), zW = new THREE.Vector3(0, 0, 1);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(t, zW, new THREE.Vector3().crossVectors(t, zW)));   // loop plane = (t, z); thickness in the front plane
    const tip = new THREE.Vector3(bails[side].tip[0], bails[side].tip[1], b.Z), c = tip.addScaledVector(t, -b.LEN_OUT / 2);
    g.translate(c.x, c.y, c.z); g.computeVertexNormals(); parts.push(g);
  }
  return mergeGeometries(parts.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
}
