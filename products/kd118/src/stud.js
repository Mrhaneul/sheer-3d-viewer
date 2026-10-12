import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Marquise stud geometry (KD-118). Pure geometry (no DOM): runs headless in Node.
// Frame: stud axis along z, stone facing +z (the viewer), z = 0 at the prong tips, post toward -z; the marquise's long axis
// is y. Angles phi are measured from +y (phi = 0: top point; pi/2: right side). Built like KD-117's stud (smooth claws that
// curl over the stone and merge into the basket's rounded back edge), with the basket and stone following a marquise outline.

// Marquise outline: two circular arcs (vesica), half-length a = L/2 along y, half-width b = W/2 along x.
export function marquiseRadius(phi, L, W) {
  const a = L / 2, b = W / 2, rho = (b + a * a / b) / 2, c = (a * a / b - b) / 2, s = Math.abs(Math.sin(phi));
  return -c * s + Math.sqrt(c * c * s * s + rho * rho - c * c);
}
// Marquise brilliant: the round brilliant (built with r = W/2) warped radially to the marquise outline, as KD-115's pear.
export function marquiseBrilliant(roundGeo, L, W) {
  const g = roundGeo.clone(), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), rho = Math.hypot(x, z); if (rho < 1e-9) continue;
    const phi = Math.atan2(x, -z), k = marquiseRadius(phi, L, W) / (W / 2);           // phi = 0 along -z (-> +y after rotation)
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  g.rotateX(Math.PI / 2);                                                               // table toward +z; -z -> +y (long axis)
  g.computeVertexNormals();
  return g;
}

// Basket: KD-117's lathe cup generalised to the marquise. Each profile point is (s, d, z): radius = s * R(phi) + d.
export function basketGeometry(b) {
  // b: { L, W, OFF (collar outside the girdle), Z_GIRDLE, DEPTH, PAV_DEPTH, CLEAR, LIP, FILLET, NPHI }
  const prof = [], zb = -b.DEPTH, f = b.FILLET;
  prof.push([0, 0, zb]);
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (Math.PI / 2) * k / 6; prof.push([1, b.OFF - f + f * Math.cos(a), zb + f + f * Math.sin(a)]); }
  prof.push([1, b.OFF, b.Z_GIRDLE], [1, -b.LIP, b.Z_GIRDLE]);
  for (let k = 1; k <= 12; k++) { const t = k / 12; prof.push([Math.max(0.002, 1 - t), -b.LIP * (1 - t), Math.max(b.Z_GIRDLE - t * (b.PAV_DEPTH + b.CLEAR), zb + 0.1)]); }
  prof.push([0, 0, Math.max(b.Z_GIRDLE - b.PAV_DEPTH - b.CLEAR, zb + 0.1)]);
  const N = b.NPHI, M = prof.length, pos = [], idx = [];
  for (let i = 0; i < N; i++) {
    const phi = 2 * Math.PI * i / N, R = marquiseRadius(phi, b.L, b.W), dx = Math.sin(phi), dy = Math.cos(phi);
    for (const [s, d, z] of prof) { const r = s * R + d; pos.push(r * dx, r * dy, z); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M - 1; j++) {
    const i2 = (i + 1) % N, A = i * M + j, B = i * M + j + 1, C = i2 * M + j, D = i2 * M + j + 1;
    idx.push(A, B, C, B, D, C);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  // orient outward (signed volume), then crease only the sharp edges (the marquise points and the collar top)
  const P = g.attributes.position.array, I = g.index.array; let v = 0;
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b2 = I[t + 1] * 3, c = I[t + 2] * 3;
    v += P[a] * (P[b2 + 1] * P[c + 2] - P[b2 + 2] * P[c + 1]) - P[a + 1] * (P[b2] * P[c + 2] - P[b2 + 2] * P[c]) + P[a + 2] * (P[b2] * P[c + 1] - P[b2 + 1] * P[c]); }
  if (v < 0) for (let t = 0; t < I.length; t += 3) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
  return toCreasedNormals(g, Math.PI / 5);
}

// Claws: as KD-117 (stub buried in the basket -> curl around the rounded back edge -> straight up the side -> curl over the
// stone's edge), each with its own angle, radial position and size.
class ClawCurve extends THREE.Curve {
  constructor(q, c) {
    super(); this.q = q; this.c = c; this.dx = Math.sin(c.ANG); this.dy = Math.cos(c.ANG);
    this.zLow = -q.DEPTH + c.WIRE + q.BACK_IN; this.zA = -c.BEND - c.WIRE;
    this.L0 = c.STUB; this.L1 = c.BEND_B * Math.PI / 2; this.L2 = this.zA - (this.zLow + c.BEND_B); this.L3 = c.BEND * c.END_ANG;
  }
  getPoint(t, v = new THREE.Vector3()) {
    const c = this.c, R = c.R_AXIS, bb = c.BEND_B; let s = t * (this.L0 + this.L1 + this.L2 + this.L3), r, z;
    if (s <= this.L0) { r = R - bb - c.STUB + s; z = this.zLow; }
    else if ((s -= this.L0) <= this.L1) { const ph = -Math.PI / 2 + s / bb; r = R - bb + bb * Math.cos(ph); z = this.zLow + bb + bb * Math.sin(ph); }
    else if ((s -= this.L1) <= this.L2) { r = R; z = this.zLow + bb + s; }
    else { s -= this.L2; const ph = s / c.BEND; r = R - c.BEND + c.BEND * Math.cos(ph); z = this.zA + c.BEND * Math.sin(ph); }
    return v.set(r * this.dx, r * this.dy, z);
  }
}
export function clawCurve(q, c) { return new ClawCurve(q, c); }
export function clawsGeometry(q) {
  // q: { DEPTH, BACK_IN, CLAWS: [{ ANG, R_AXIS, WIRE, BEND, END_ANG, BEND_B, STUB }], SEG }
  const parts = [];
  for (const c of q.CLAWS) {
    const curve = clawCurve(q, c), tube = new THREE.TubeGeometry(curve, q.SEG || 160, c.WIRE, 20, false);
    for (const t of [0, 1]) { const e = curve.getPoint(t), sp = new THREE.SphereGeometry(c.WIRE, 20, 14); sp.translate(e.x, e.y, e.z); parts.push(sp.toNonIndexed()); }
    parts.push(tube.toNonIndexed());
  }
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

// Ear post: straight wire behind the basket with a rounded end.
export function postGeometry(p) {
  const r = p.DIA / 2, c = new THREE.CylinderGeometry(r, r, p.LEN, 24, 1, true); c.rotateX(Math.PI / 2); c.translate(0, 0, p.Z0 - p.LEN / 2);
  const e = new THREE.SphereGeometry(r, 24, 12); e.translate(0, 0, p.Z0 - p.LEN);
  return mergeGeometries([c.toNonIndexed(), e.toNonIndexed()].map(g => { g.deleteAttribute('uv'); return g; }));
}
