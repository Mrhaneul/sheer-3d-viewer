import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Setting geometry from KD-117's stud (basket + smooth claws), reused for KD-120's chain station. Pure geometry (no DOM).
// Frame: stud axis along z, stone facing +z (the viewer), z = 0 at the prong tips, the post running back to -z.

// Basket: a lathe-turned cup behind the stone. Outer wall = the collar seen around the girdle in the front view; inside,
// a seat that follows the stone's pavilion cone with a small clearance (the side view shows a solid body behind the stone).
export function basketGeometry(b) {
  // b: { R_OUT, Z_GIRDLE, DEPTH, R_GIRDLE, PAV_DEPTH, CLEAR, LIP, FILLET, SEG }
  const p = [], zb = -b.DEPTH, f = b.FILLET;
  p.push(new THREE.Vector2(0, zb));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (Math.PI / 2) * k / 6; p.push(new THREE.Vector2(b.R_OUT - f + f * Math.cos(a), zb + f + f * Math.sin(a))); }
  p.push(new THREE.Vector2(b.R_OUT, b.Z_GIRDLE));                                   // collar top, level with the girdle
  p.push(new THREE.Vector2(b.R_GIRDLE - b.LIP, b.Z_GIRDLE));                         // seat lip just inside the girdle
  const zCulet = b.Z_GIRDLE - b.PAV_DEPTH;
  for (let k = 1; k <= 12; k++) {                                                    // seat: a cone from the lip down to CLEAR below
    const t = k / 12, z = b.Z_GIRDLE - t * (b.PAV_DEPTH + b.CLEAR), r = (b.R_GIRDLE - b.LIP) * (1 - t);   // the culet, so the
    p.push(new THREE.Vector2(Math.max(0.001, r), Math.max(z, zb + 0.15)));          // gap to the pavilion opens toward the culet
  }
  p.push(new THREE.Vector2(0, Math.max(zCulet - b.CLEAR, zb + 0.15)));
  return toCreasedNormals(new THREE.LatheGeometry(p, b.SEG), Math.PI / 5);
}

// Claws (2026-10-09, per Haneul + CAD views): each prong is ONE smooth swept tube. From a short stub buried inside the
// basket it curls outward around the basket's rounded back edge (BEND_B), runs straight up the outside of the basket,
// then curls forward and inward over the stone's edge (BEND). Both arcs have radii larger than the tube, so it never folds.
// The front tip is closed by a sphere of the tube's radius (seamless); the back end is hidden inside the basket's metal.
class ClawCurve extends THREE.Curve {
  // in the claw's radial plane (r, z). Segments by arc length: stub (inward of the back arc, along +r) -> back arc (centre
  // (R - bb, zLow + bb), from straight down to straight out) -> straight up at r = R -> front arc (radius bend, inward).
  constructor(q, ang) {
    super(); this.ca = Math.cos(ang); this.sa = Math.sin(ang); this.q = q;
    this.zLow = -q.DEPTH + q.WIRE + q.BACK_IN;                 // tube bottom sits BACK_IN inside the basket's flat back face
    this.zA = -q.BEND - q.WIRE;                                // the front arc's top reaches z = 0 (prong tips)
    this.L0 = q.STUB; this.L1 = q.BEND_B * Math.PI / 2; this.L2 = this.zA - (this.zLow + q.BEND_B); this.L3 = q.BEND * q.END_ANG;
  }
  getPoint(t, v = new THREE.Vector3()) {
    const q = this.q, R = q.R_AXIS, bb = q.BEND_B; let s = t * (this.L0 + this.L1 + this.L2 + this.L3), r, z;
    if (s <= this.L0) { r = R - bb - q.STUB + s; z = this.zLow; }
    else if ((s -= this.L0) <= this.L1) { const ph = -Math.PI / 2 + s / bb; r = R - bb + bb * Math.cos(ph); z = this.zLow + bb + bb * Math.sin(ph); }
    else if ((s -= this.L1) <= this.L2) { r = R; z = this.zLow + bb + s; }
    else { s -= this.L2; const ph = s / q.BEND; r = R - q.BEND + q.BEND * Math.cos(ph); z = this.zA + q.BEND * Math.sin(ph); }
    return v.set(r * this.ca, r * this.sa, z);
  }
}
export function clawCurve(q, k) { return new ClawCurve(q, q.ANG0 + 2 * Math.PI * k / q.N); }
export function clawsGeometry(q) {
  // q: { N, ANG0, R_AXIS, WIRE, BEND, END_ANG, BEND_B, STUB, BACK_IN, DEPTH, SEG }
  const parts = [];
  for (let k = 0; k < q.N; k++) {
    const curve = clawCurve(q, k);
    const tube = new THREE.TubeGeometry(curve, q.SEG || 160, q.WIRE, 24, false);
    for (const t of [0, 1]) { const e = curve.getPoint(t), sp = new THREE.SphereGeometry(q.WIRE, 24, 16); sp.translate(e.x, e.y, e.z); parts.push(sp.toNonIndexed()); }
    parts.push(tube.toNonIndexed());
  }
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

// Ear post: straight wire behind the basket with a rounded end.
export function postGeometry(p) {
  // p: { DIA, LEN, Z0 }
  const r = p.DIA / 2, c = new THREE.CylinderGeometry(r, r, p.LEN, 24, 1, true); c.rotateX(Math.PI / 2); c.translate(0, 0, p.Z0 - p.LEN / 2);
  const e = new THREE.SphereGeometry(r, 24, 12); e.translate(0, 0, p.Z0 - p.LEN);
  return mergeGeometries([c.toNonIndexed(), e.toNonIndexed()].map(g => { g.deleteAttribute('uv'); return g; }));
}

// KD-120: the slider ring on the back of the setting. An elongated (stadium) ring lying in the x-z plane; the chain runs
// vertically (y) through its hole, which is how the loop above the setting cinches.
class StadiumCurve extends THREE.Curve {
  constructor(rho, len, z0) { super(); this.rho = rho; this.len = len; this.z0 = z0; this.L = 2 * len + 2 * Math.PI * rho; }
  getPoint(t, v = new THREE.Vector3()) {
    let s = t * this.L; const r = this.rho, h = this.len / 2;
    if (s < this.len) return v.set(r, 0, this.z0 + h - s);                                   // right straight, toward -z
    if ((s -= this.len) < Math.PI * r) { const a = s / r; return v.set(r * Math.cos(a), 0, this.z0 - h - r * Math.sin(a)); }
    if ((s -= Math.PI * r) < this.len) return v.set(-r, 0, this.z0 - h + s);                  // left straight, toward +z
    s -= this.len; const a = Math.PI + s / r; return v.set(r * Math.cos(a), 0, this.z0 + h - r * Math.sin(a));
  }
}
export function sliderRingGeometry(r) {
  // r: { RHO (half-width of the centreline), LEN (straight length), WIRE, Z0 (centre) }
  return new THREE.TubeGeometry(new StadiumCurve(r.RHO, r.LEN, r.Z0), 160, r.WIRE, 16, true);
}
// Threader bar: a straight rod with rounded ends, axis along y.
export function barGeometry(b) {
  // b: { DIA, LEN, Y_TOP }
  const r = b.DIA / 2, c = new THREE.CylinderGeometry(r, r, b.LEN - b.DIA, 32, 1, true); c.translate(0, b.Y_TOP - b.LEN / 2, 0);
  const t = new THREE.SphereGeometry(r, 32, 16); t.translate(0, b.Y_TOP - r, 0);
  const e = new THREE.SphereGeometry(r, 32, 16); e.translate(0, b.Y_TOP - b.LEN + r, 0);
  return mergeGeometries([c, t, e].map(g => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
}
