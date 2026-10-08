import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// KD-135 organic pendant (Karma CAD sheet, 25 Aug 2026). Pure geometry (no DOM): runs headless in Node.
// Frame: a closed tube swept along the band centreline traced from the CAD front view (CV), with the measured front-view
// width, a measured 1.25 mm thickness and a depth wobble fitted to the side + top views. Molten texture: ASSUMED, seeded.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// smooth 3D ripple field in about [-1, 1] (seeded plane waves; no clipping, so no craters)
export function ripple(seed, n, minL, maxL) {
  const r = rng(seed), w = [];
  for (let i = 0; i < n; i++) {
    const u = 2 * r() - 1, ph = 2 * Math.PI * r(), sq = Math.sqrt(1 - u * u), L = minL + (maxL - minL) * r(), k = 2 * Math.PI / L;
    w.push([k * sq * Math.cos(ph), k * sq * Math.sin(ph), k * u, 2 * Math.PI * r()]);
  }
  return (x, y, z) => { let s = 0; for (const [a, b, c, p] of w) s += Math.sin(a * x + b * y + c * z + p); return s / Math.sqrt(n / 2); };
}

// Sweep an elliptical section along a closed or open 3D centreline. half-width a_i along N (in-plane), half-thickness b_i
// along B; optional displacement along the section normal. Returns indexed geometry (closed loop: seamless).
export function sweep(C, a, b, opts = {}) {
  const n = C.length, seg = opts.seg || 24, closed = opts.closed !== false, disp = opts.disp || null, up = opts.up || new THREE.Vector3(0, 0, 1);
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const prev = C[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = C[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const T = next.clone().sub(prev).normalize();
    const N = (opts.fixedN ? opts.fixedN.clone() : new THREE.Vector3().crossVectors(up, T)).normalize();   // in-plane normal (or fixed axis)
    const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
    for (let k = 0; k < seg; k++) {
      const f = 2 * Math.PI * k / seg, c = Math.cos(f), s = Math.sin(f);
      const p = C[i].clone().addScaledVector(N, a[i] * c).addScaledVector(Bn, b[i] * s);
      if (disp) { const nrm = N.clone().multiplyScalar(c / a[i]).addScaledVector(Bn, s / b[i]).normalize(); p.addScaledVector(nrm, disp(p.x, p.y, p.z)); }
      pos.push(p.x, p.y, p.z);
    }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
    const i2 = (i + 1) % n, k2 = (k + 1) % seg, A = i * seg + k, B = i * seg + k2, Cc = i2 * seg + k, D = i2 * seg + k2;
    idx.push(A, Cc, B, B, Cc, D);
  }
  if (!closed) {                                              // cap the two ends with fans (hidden inside the frame anyway)
    for (const [i, flip] of [[0, true], [n - 1, false]]) {
      const c0 = pos.length / 3; pos.push(C[i].x, C[i].y, C[i].z);
      for (let k = 0; k < seg; k++) { const A = i * seg + k, B = i * seg + (k + 1) % seg; flip ? idx.push(c0, B, A) : idx.push(c0, A, B); }
    }
  }
  // orient outward: the section's handedness depends on the frame (N x T), so check the signed volume and flip if needed
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]); }
  if (v < 0) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Teardrop bail loop in the y-z plane: pointed at the bottom (into the frame), round at the top. Strip width (x) tapers.
export function bailGeometry(b) {
  // b: { X, Y0 (bottom), Z, H (outer height), W (outer width), WIRE, XW_BOT, XW_TOP, N }
  const C = [], a = [], t = [], hIn = b.H - b.WIRE, wIn = b.W - b.WIRE;
  for (let k = 0; k < b.N; k++) {
    const f = 2 * Math.PI * k / b.N, u = (1 - Math.cos(f)) / 2;     // u: 0 at the bottom point, 1 at the top
    C.push(new THREE.Vector3(b.X, b.Y0 + b.WIRE / 2 + hIn * u, b.Z + (wIn / 2) * Math.sin(f) * Math.sqrt(u)));
    a.push((b.XW_BOT + (b.XW_TOP - b.XW_BOT) * u) / 2); t.push(b.WIRE / 2);
  }
  return sweep(C, a, t, { seg: 16, closed: true, fixedN: new THREE.Vector3(1, 0, 0) });
}

export function meshVolume(g) {
  const P = g.attributes.position.array, I = g.index ? g.index.array : null, n = I ? I.length : P.length / 3; let v = 0;
  for (let t = 0; t < n; t += 3) { const a = (I ? I[t] : t) * 3, b = (I ? I[t + 1] : t + 1) * 3, c = (I ? I[t + 2] : t + 2) * 3;
    v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
  return v;
}
