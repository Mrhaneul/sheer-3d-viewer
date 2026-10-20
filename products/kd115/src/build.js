import * as THREE from 'three';
import { pearBrilliant, collarGeometry, vClawGeometry } from './pendant.js';

// KD-115 Pear pendant: dimensions and pendant assembly, shared by the product viewer (main.js) and the Fitting Room
// (2026-10-20). Moved here unchanged from main.js; mm, pendant frame (origin at the centre of the pear's round end, y up,
// z toward the viewer). Pure geometry plus the materials the caller passes in: no DOM. The chain itself is not built
// here: the viewer lays it out as a V for the product page, and the Fitting Room drapes it on the bust with physics,
// both from the CHAIN numbers below.

export const METALS = {
  gold:   { color: 0xf2d4a2, roughness: 0.05 },   // champagne 14k: hue ≈38°, sat ≈0.33 (per Joyce's reference; was 0xeed283, 8° greener)
  silver: { color: 0xc9cbcf, roughness: 0.06 },
};

// ---------- Round brilliant cut: 57 facets, 8-fold symmetry ----------
export function brilliantGeometry(r) {
  const D = 2 * r;
  const yGt = 0.015 * D, yGb = -0.015 * D, yT = yGt + 0.15 * D, yC = yGb - 0.43 * D;
  const seg = a => a * Math.PI / 8;
  const P = (rad, ang, y) => new THREE.Vector3(rad * Math.cos(ang), y, rad * Math.sin(ang));
  const A = [], B = [], E = [], Ct = [], Cb = [];
  for (let k = 0; k < 8; k++) {
    A.push(P(0.56 * r, seg(2 * k), yT));
    B.push(P(0.80 * r, seg(2 * k + 1), yT - 0.55 * (yT - yGt)));
    E.push(P(0.27 * r, seg(2 * k + 1), yGb - 0.74 * (yGb - yC)));
  }
  for (let k = 0; k < 16; k++) { Ct.push(P(r, seg(k), yGt)); Cb.push(P(r, seg(k), yGb)); }
  const culet = new THREE.Vector3(0, yC, 0), top = new THREE.Vector3(0, yT, 0);
  const tris = [];
  const tri = (p, q, s) => tris.push([p, q, s]);
  const quad = (p, q, s, t) => { tri(p, q, s); tri(p, s, t); };
  for (let k = 0; k < 8; k++) {
    const k1 = (k + 1) % 8, km = (k + 7) % 8, g0 = 2 * k, g1 = (2 * k + 1) % 16, g2 = (2 * k + 2) % 16;
    tri(top, A[k], A[k1]);
    tri(A[k], A[k1], B[k]);
    quad(A[k], B[km], Ct[g0], B[k]);
    tri(B[k], Ct[g0], Ct[g1]);
    tri(B[k], Ct[g1], Ct[g2]);
    tri(E[k], Cb[g0], Cb[g1]);
    tri(E[k], Cb[g1], Cb[g2]);
    quad(Cb[g0], E[km], culet, E[k]);
  }
  for (let k = 0; k < 16; k++) quad(Ct[k], Ct[(k + 1) % 16], Cb[(k + 1) % 16], Cb[k]);
  const pos = [];
  const n = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let [p, q, s] of tris) {
    e1.subVectors(q, p); e2.subVectors(s, p); n.crossVectors(e1, e2);
    c.addVectors(p, q).add(s).multiplyScalar(1 / 3);
    if (n.dot(c) < 0) { const t = q; q = s; s = t; }
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- KD-115 dimensions (Karma CAD sheet, 18 Aug 2026; mm) ----------
// Labels: CAD = printed; CAD-MEASURED = measured from the sheet by CV; ASSUMED = not specified, confirm with Karma.
// Pendant frame: origin at the centre of the pear's round end, y up (pear point up), z toward the viewer.
const PEAR = { W: 2.0, L: 4.0 };                       // CAD ("Pear 4*2 mm", 0.093 ct)
const Z_FRONT = 0, Z_BACK = -2.5;                      // CAD (side view 2.5 MM deep)
const STONE_Z = -0.43;                                 // girdle plane: table just behind the front face (-0.10)
const COLLAR = { WALL: 0.20, Z_FRONT: STONE_Z + 0.03, Z_BACK, BACK_T: 0.12 };   // CAD-MEASURED overall height 4.54–4.7 mm -> wall 0.2;
                                                       // ASSUMED back plate (side view shows a solid body behind the stone)
const VCLAW = { TIP_Y: 3.45, ARM_DX: 0.62, ARM_DY: 0.80, T: 0.30, Z_FRONT, Z_BACK };   // CAD-MEASURED: chevron capping the tip
                                                       // ("V-claw protecting the pointed end"); top view: walls run back full depth
const PRONG = { R: 0.26, X: 0.92, Y: -0.55, POST_R: 0.20 };   // CAD-MEASURED: two round prongs holding the round end
const LOOP = { X: 1.17, Y: 3.45 - 1.66, Z: -1.79, R: 0.81, T: 0.34 };   // CAD-MEASURED: centres ±1.17 mm, 1.66 mm below the top,
                                                       // 0.84 mm hole, outer edge ±2.32 mm; side view: 1.79 mm back, 0.64 mm deep
const CHAIN = { R: 0.89, T: 0.16, PITCH: 1.21 };       // CAD-MEASURED (front view): rolo chain, rings ≈ 2.1 mm, 0.32 mm wire
const V_ANGLE = THREE.MathUtils.degToRad(65.6);         // CAD-MEASURED: both sides of the V, 65.7° / 65.5° below horizontal
const CHAIN_LEN = 16 * 25.4;                            // reference note: "chain length 16+2 inch" (extender not modelled)
const CLASP_R = 2.1;                                    // ASSUMED spring ring (no clasp in the CAD)

const PEAR_SHP = 2.33;   // ASSUMED shape: shouldered pear whose point (37.8°) matches the CAD V-claw; carat check favours it over a
                        // straight-sided teardrop (0.053 vs 0.044 ct; CAD 0.093 ct, marked "Estimated")

export { PEAR, Z_FRONT, Z_BACK, STONE_Z, COLLAR, VCLAW, PRONG, LOOP, CHAIN, V_ANGLE, CHAIN_LEN, CLASP_R, PEAR_SHP };

// Where the chain meets the pendant: it leaves each loop at the measured V angle (same point as the viewer's chain).
const ATTACH = [-1, 1].map(sx => [sx * (LOOP.X + LOOP.R * Math.cos(V_ANGLE)), LOOP.Y + LOOP.R * Math.sin(V_ANGLE), LOOP.Z]);

export const info = {
  id: 'kd115', sku: 'KD-115', name: 'Pear pendant', kind: 'necklace',
  chain: { length: CHAIN_LEN, style: 'rolo', link: { R: CHAIN.R, T: CHAIN.T, pitch: CHAIN.PITCH }, claspR: CLASP_R },
  attach: ATTACH,          // the chain's two ends at the pendant (left, right), in the pendant frame
  metals: METALS,
};

// Builds the pendant (stone, collar, V-claw, prongs, loops; no chain). metal: material for the gold/silver parts;
// stone: material for the pear. The stone mesh is also returned as group.userData.stones (the viewer's two-pass
// stone rendering needs it).
export function buildPendant({ metal, stone } = {}) {
  const bandMat = metal, jewel = new THREE.Group();
  const stoneGeo = pearBrilliant(brilliantGeometry(PEAR.W / 2), PEAR.W, PEAR.L, PEAR_SHP);
  const stones = new THREE.Mesh(stoneGeo, stone); stones.position.z = STONE_Z; jewel.add(stones);
  // collar, V-claw, prongs, loops
  jewel.add(new THREE.Mesh(collarGeometry(COLLAR), bandMat));
  jewel.add(new THREE.Mesh(vClawGeometry(VCLAW), bandMat));
  for (const sx of [-1, 1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(PRONG.R, 24, 16), bandMat); ball.position.set(sx * PRONG.X, PRONG.Y, STONE_Z + 0.15); jewel.add(ball);
    // (2026-10-06) no post running back: it poked 0.05 mm through the collar wall and left a jagged line along the side;
    // the CAD side view shows only the collar's own bottom edge there. The prong ball sits on the collar's front rim.
    const loop = new THREE.Mesh(new THREE.TorusGeometry(LOOP.R, LOOP.T, 16, 48), bandMat); loop.position.set(sx * LOOP.X, LOOP.Y, LOOP.Z); jewel.add(loop);
  }
  jewel.userData.stones = stones;
  return jewel;
}
