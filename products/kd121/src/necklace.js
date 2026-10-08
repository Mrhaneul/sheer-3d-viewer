import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// KD-121 diamond line necklace (Karma CAD sheet, 19 Aug 2026). One "link" = a 2-prong open-gallery setting:
// two round prong posts, an upper collar the stone sits in, a lower ring, open between them. Links are joined by
// a flat jump ring at mid-height. Pure geometry (no DOM) so it runs headless in Node.
// Local link frame: x = along the chain, y = stone axis (up = toward the viewer), z = across. y = 0 is the prong tips.

function tubeLathe(rIn, rOut, yTop, yBot, round, seg) {
  // short tube with rounded outer edges, as a closed lathe profile (radius, y); outer edges get a small fillet
  const p = [];
  const arc = (cx, cy, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; p.push(new THREE.Vector2(cx + round * Math.cos(a), cy + round * Math.sin(a))); } };
  p.push(new THREE.Vector2(rIn, yBot));
  arc(rOut - round, yBot + round, -Math.PI / 2, 0, 4);      // bottom outer fillet
  arc(rOut - round, yTop - round, 0, Math.PI / 2, 4);       // top outer fillet
  p.push(new THREE.Vector2(rIn, yTop));
  p.push(new THREE.Vector2(rIn, yBot));                      // inner wall back down (closes the section)
  return toCreasedNormals(new THREE.LatheGeometry(p, seg), Math.PI / 5);
}

export function linkGeometry(L) {
  // L: { H, PRONG_R, PRONG_X, COLLAR_IN, COLLAR_OUT, COLLAR_TOP, COLLAR_BOT, RING_TOP, RING_BOT, ROUND, SEG }
  const parts = [];
  for (const sx of [-1, 1]) {                                  // two prong posts with rounded ends
    const post = new THREE.CylinderGeometry(L.PRONG_R, L.PRONG_R, L.H - 2 * L.PRONG_R, 16, L.POST_SEGS || 1, true);   // POST_SEGS: preview-only subdivision
    post.translate(sx * L.PRONG_X, -L.H / 2, 0); parts.push(post.toNonIndexed());
    for (const y of [-L.PRONG_R, -L.H + L.PRONG_R]) {
      const tip = new THREE.SphereGeometry(L.PRONG_R, 16, 10); tip.translate(sx * L.PRONG_X, y, 0); parts.push(tip.toNonIndexed());
    }
  }
  parts.push(tubeLathe(L.COLLAR_IN, L.COLLAR_OUT, -L.COLLAR_TOP, -L.COLLAR_BOT, L.ROUND, L.SEG));   // upper collar
  parts.push(tubeLathe(L.COLLAR_IN, L.COLLAR_OUT, -L.RING_TOP, -L.RING_BOT, L.ROUND, L.SEG));       // lower ring
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

export function jumpRingGeometry(J) {
  // J: { R (centreline), T (wire radius) } lying flat (axis = local y)
  const g = new THREE.TorusGeometry(J.R, J.T, 12, 32); g.rotateX(Math.PI / 2); return g;
}

// Instance matrices: links around a circle in the x-y plane, stones facing +z (toward the viewer, like the front view),
// with a gap at the top for the clasp. Local link x -> chain tangent, local y -> +z, local z -> tangent x +z.
export function layout(P) {
  // P: { N, PITCH, CLASP_GAP, STONE_Y_TOP }
  const total = P.N * P.PITCH + P.CLASP_GAP, R = total / (2 * Math.PI);
  const links = [], rings = [];
  const frame = (th, along) => {
    const t = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0), y = new THREE.Vector3(0, 0, 1), z = new THREE.Vector3().crossVectors(t, y);
    const m = new THREE.Matrix4().makeBasis(t, y, z);
    // place the link so its prong tips (local y = 0) lie at world z = 0 plane offset; centre on the circle
    m.setPosition(R * Math.cos(th) + along.x, R * Math.sin(th) + along.y, 0);
    return m;
  };
  const a0 = Math.PI / 2 + (P.CLASP_GAP / 2 + P.PITCH / 2) / R;          // first link just past the clasp
  for (let i = 0; i < P.N; i++) {
    const th = a0 + i * P.PITCH / R;
    links.push(frame(th, new THREE.Vector3()));
    if (i < P.N - 1) rings.push(frame(th + P.PITCH / (2 * R), new THREE.Vector3()));
  }
  return { R, links, rings, firstAngle: a0, lastAngle: a0 + (P.N - 1) * P.PITCH / R };
}
