import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// KD-122 lariat (Karma CAD sheet, 19 Aug 2026). Pure geometry (no DOM): runs headless in Node.
// World frame: necklace in the x-y plane, y up, origin at the junction where both sides meet; +z toward the viewer.

// Oval cable-chain link: a tube swept along an ellipse (true round wire, unlike a scaled torus).
export function linkGeometry(c) {
  // c: { A (centreline half-length), B (centreline half-width), R (wire radius) } -> link in the local x-y plane, long axis x
  class Ell extends THREE.Curve { getPoint(t, v = new THREE.Vector3()) { const a = 2 * Math.PI * t; return v.set(c.A * Math.cos(a), c.B * Math.sin(a), 0); } }
  return new THREE.TubeGeometry(new Ell(), 40, c.R, 8, true);
}

// Resample a polyline at a fixed arc-length step; returns points and unit tangents.
export function resample(poly, step) {
  const P = poly.map(p => new THREE.Vector3(p[0], p[1], 0)), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const out = [], total = cum[cum.length - 1];
  for (let s = 0, j = 0; s <= total + 1e-9; s += step) {
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const p = P[j].clone().lerp(P[j + 1], f), t = P[j + 1].clone().sub(P[j]).normalize();
    out.push({ p, t });
  }
  return { pts: out, length: total };
}

// Cable chain along a path: link k centred at arc length k*pitch, long axis along the tangent; links alternate between
// lying in the necklace plane and standing perpendicular to it (so each passes through its neighbours).
export function chainMatrices(poly, pitch) {
  // fit a whole number of links: the spacing is nudged (< 0.3%) so the first and last links land exactly on the path ends
  const len = resample(poly, 1e9).length, n = Math.max(1, Math.round(len / pitch));
  const { pts, length } = resample(poly, len / n * (1 - 1e-9)), M = [];
  pts.forEach(({ p, t }, k) => {
    const z = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3().crossVectors(z, t).normalize();   // in-plane normal
    const across = k % 2 === 0 ? n : z;                      // even links flat, odd links upright
    const third = new THREE.Vector3().crossVectors(t, across);
    M.push(new THREE.Matrix4().makeBasis(t, across, third).setPosition(p));
  });
  return { M, length };
}

// 4-prong basket for the round stone. Local frame: y = stone axis (toward the viewer), y = 0 at the prong tips.
export function settingGeometry(s) {
  // s: { H, PRONG_R, PRONG_D (centre distance from axis), COLLAR_IN, COLLAR_OUT, COLLAR_TOP, COLLAR_BOT, SEG }
  const parts = [];
  for (let k = 0; k < 4; k++) {                               // prongs on the diagonals (top view: 4 balls at the corners)
    const a = Math.PI / 4 + k * Math.PI / 2, x = s.PRONG_D * Math.cos(a), z = s.PRONG_D * Math.sin(a);
    const post = new THREE.CylinderGeometry(s.PRONG_R, s.PRONG_R, s.H - 2 * s.PRONG_R, 16, 1, true); post.translate(x, -s.H / 2, z);
    parts.push(post.toNonIndexed());
    for (const y of [-s.PRONG_R, -s.H + s.PRONG_R]) { const b = new THREE.SphereGeometry(s.PRONG_R, 16, 10); b.translate(x, y, z); parts.push(b.toNonIndexed()); }
  }
  // collar cup under the stone: open top, rounded closed bottom (side view shows a cup between the prongs)
  const r = 0.12, prof = [new THREE.Vector2(0, -s.COLLAR_BOT)];
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (Math.PI / 2) * k / 6; prof.push(new THREE.Vector2(s.COLLAR_OUT - r + r * Math.cos(a), -s.COLLAR_BOT + r + r * Math.sin(a))); }
  prof.push(new THREE.Vector2(s.COLLAR_OUT, -s.COLLAR_TOP), new THREE.Vector2(s.COLLAR_IN, -s.COLLAR_TOP), new THREE.Vector2(s.COLLAR_IN, -s.COLLAR_BOT + 0.12), new THREE.Vector2(0, -s.COLLAR_BOT + 0.12));
  parts.push(toCreasedNormals(new THREE.LatheGeometry(prof, s.SEG), Math.PI / 5));
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

// Lariat ring: torus with an elliptical wire section (CV: 0.88 mm across the ring, 1.06 mm deep).
export function ringGeometry(r) {
  // r: { R (centreline radius), A (half-width in plane), B (half-depth along z) } lying in the x-y plane
  const prof = [];
  for (let k = 0; k <= 32; k++) {                             // <= 32: repeat the first point so the wire section closes
    const a = 2 * Math.PI * k / 32;
    prof.push(new THREE.Vector2(r.R + r.A * Math.cos(a), r.B * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(prof, 96); g.rotateX(Math.PI / 2);   // lathe spins about y -> ring axis along z
  return g;
}
