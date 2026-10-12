import * as THREE from 'three';

// Fine cable chain (from KD-122's lariat.js, unchanged): oval links instanced along a path in the x-y plane.
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

