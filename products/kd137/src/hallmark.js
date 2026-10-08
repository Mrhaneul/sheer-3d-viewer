import * as THREE from 'three';

// Hallmark patch (2026-10-01): a thin curved strip just inside the band's inner face, carrying a text texture.
// UV (s, t): s = 0 → 1 reads left → right, t = 0 → 1 bottom → top of the letters, when seen from the default
// front-above camera looking through the hoop (verified by projection). Faces inward (toward the hoop centre).
export function hallmarkGeometry(h) {
  // h: { R, THETA_C (centre angle), ARC_MM, HEIGHT_MM, NS, NT }
  const R0 = typeof h.R === 'function' ? h.R(0) : h.R, dTh = h.ARC_MM / R0, pos = [], uv = [], idx = [];
  for (let j = 0; j <= h.NT; j++) for (let i = 0; i <= h.NS; i++) {
    const s = i / h.NS, t = j / h.NT;
    const th = h.THETA_C + (s - 0.5) * dTh, z = (h.Z_C || 0) + (0.5 - t) * h.HEIGHT_MM;   // letter tops toward -z (away from the front)
    const R = typeof h.R === 'function' ? h.R(z) : h.R;                  // R may follow a curved surface across the width
    pos.push(R * Math.cos(th), R * Math.sin(th), z); uv.push(s, t);
  }
  const row = h.NS + 1;
  for (let j = 0; j < h.NT; j++) for (let i = 0; i < h.NS; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);   // wound so the front face looks toward the hoop centre
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
