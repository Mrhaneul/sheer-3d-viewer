import * as THREE from 'three';

// KD-136 organic disc pendant (Karma CAD sheet, 25 Aug 2026). Pure geometry (no DOM): runs headless in Node.
// Runtime part: surface heights on a precomputed topology (see topology.js, build-time only).
// Disc in the x-y plane (y up), z toward the viewer; origin = centre of the disc's bounding box in the front view.
// Outline and hole are traced from the CAD front view (CV, Fourier-smoothed, within 0.08 mm of the traced pixels).
// The surface relief is ASSUMED (a hammered surface cannot be measured from flat views): seeded, so it is stable.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// smooth organic field in about [-1, 1]: a few plane waves with seeded directions, wavelengths and phases
function field(seed, n, minL, maxL) {
  const r = rng(seed), w = [];
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, L = minL + (maxL - minL) * r(); w.push([Math.cos(a) * 2 * Math.PI / L, Math.sin(a) * 2 * Math.PI / L, r() * Math.PI * 2]); }
  return (x, y) => { let s = 0; for (const [kx, ky, ph] of w) s += Math.sin(kx * x + ky * y + ph); return s / Math.sqrt(n / 2); };
}
export function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
export function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }

// Light step (runs in the browser): heights for the rounded rim and the hammered surface on a fixed topology.
export function buildSurface(topo, c) {
  const { pts, dist, tris, nBoundary } = topo, rim = c.T / 2;
  // surfaces: mid-surface warp w, local thickness t, rounded rim profile; front gets hammer dents and granulation bumps
  const warp = field(11, 6, 7, 14), thick = field(23, 5, 5, 10), dent = field(37, 9, 1.8, 3.6), soft = field(51, 6, 5, 10);
  // 2026-10-08 (per Haneul + CAD front view): the rough hammered texture is ONLY in the bottom-right zone; everywhere else
  // the face has a soft, long-wavelength undulation (5-10 mm). The zone weight fades smoothly (Gaussian) - no hard edge.
  const Z = c.ZONE, zoneW = (x, y) => (Z ? Math.exp(-(((x - Z.x) ** 2 + (y - Z.y) ** 2) / (Z.r * Z.r))) : 1);
  const prof = d => (d >= rim ? 1 : Math.sqrt(Math.max(0, 1 - (1 - d / rim) ** 2)));
  const pos = [], N = pts.length;
  const zf = new Float32Array(N), zb = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const [x, y] = pts[i], p = prof(dist[i]), w = c.WARP * warp(x, y), t = c.T * (1 + c.TVAR * thick(x, y)), zw = zoneW(x, y);
    let front = w + t / 2 * p + (c.SOFT || 0) * soft(x, y) * p - c.DENT * zw * Math.max(0, dent(x, y)) * p, back = w - t / 2 * p;
    for (const b of c.BUMPS || []) { const q = Math.hypot(x - b.x, y - b.y) / b.r; if (q < 1) front += b.h * Math.sqrt(1 - q * q) * p; }
    zf[i] = front; zb[i] = back;
  }
  // vertices: front for every point; back only for interior points (boundary points are shared: there t*prof = 0)
  for (let i = 0; i < N; i++) pos.push(pts[i][0], pts[i][1], zf[i]);
  const backIdx = new Int32Array(N);
  for (let i = 0; i < N; i++) { if (i < nBoundary) backIdx[i] = i; else { backIdx[i] = pos.length / 3; pos.push(pts[i][0], pts[i][1], zb[i]); } }
  const idx = [];
  for (const [a, b, d] of tris) {
    const ccw = (pts[b][0] - pts[a][0]) * (pts[d][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[d][0] - pts[a][0]) > 0;
    const [p, q, r] = ccw ? [a, b, d] : [a, d, b];
    idx.push(p, q, r);                                          // front faces +z
    idx.push(backIdx[p], backIdx[r], backIdx[q]);               // back faces -z
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, stats: { points: N, boundary: nBoundary, triangles: idx.length / 3, droppedOffsets: topo.dropped } };
}

export function unpackTopology(p) {
  const dec = (s, T) => { const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };
  const P = dec(p.pts, Float32Array), D = dec(p.dist, Float32Array), I = dec(p.tris, Uint16Array);
  const pts = [], tris = []; for (let i = 0; i < p.n; i++) pts.push([P[2 * i], P[2 * i + 1]]);
  for (let i = 0; i < I.length; i += 3) tris.push([I[i], I[i + 1], I[i + 2]]);
  return { pts, dist: Array.from(D), tris, nBoundary: p.nBoundary, dropped: p.dropped };
}

export function meshVolume(g) {
  const P = g.attributes.position.array, I = g.index.array; let v = 0;
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
  return v;
}

// Granulation (CAD front view: a patch of small cast bumps just inside the lower-right edge). ASSUMED placement:
// seeded points in a band 0.9-1.8 mm inside the outline, between the given angles (degrees from +x, CCW).
export function granulation(outer, seed, a0, a1, n) {
  const r = rng(seed), out = [];
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length, cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  const cand = outer.map((p, i) => ({ p, i, a: Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI })).filter(o => o.a >= a0 && o.a <= a1);
  for (let k = 0; k < n; k++) {
    const o = cand[Math.floor(r() * cand.length)], L = outer, i = o.i;
    const a = L[(i - 1 + L.length) % L.length], b = L[(i + 1) % L.length], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
    const d = 0.9 + 0.9 * r();
    out.push({ x: o.p[0] - ty / tl * d, y: o.p[1] + tx / tl * d, r: 0.22 + 0.22 * r(), h: 0.12 + 0.14 * r() });
  }
  return out;
}
