import * as THREE from 'three';
import { hallmarkGeometry } from './hallmark.js';
import { buildHoop, knuckleGeometry } from './hoop.js';

// KD-134 Chunky huggie: dimensions and assembly, shared by the product viewer (main.js) and the Fitting Room
// (2026-10-20). Moved here unchanged from main.js; everything stays in mm, in the viewer's frame (hoop in the x-y
// plane, opening at the top, band width along z). Pure geometry plus the materials the caller passes in: no DOM.

export const METALS = {
  gold:   { color: 0xf2d4a2, roughness: 0.05 },   // champagne 14k: hue ≈38°, sat ≈0.33 (per Joyce's reference; was 0xeed283, 8° greener)
  silver: { color: 0xc9cbcf, roughness: 0.06 },
};

// ---------- KD-134 dimensions (Karma CAD sheet, 25 Aug 2026; mm) ----------
// Chunky huggie: compact, squat, thick-looking (reference note). Same hinged-clicker construction as KD-137, wider and
// thicker, with a fuller (superellipse) dome and a hollow channel inside.
// Labels: CAD = printed; CAD-MEASURED = pixel-measured from the sheet; ASSUMED = not specified, confirm with Karma.
const OUTER_D = 11.5;                      // CAD (front view 11.5 MM; reference note "outer dia 11.5 mm")
const WIDTH = 6.8;                         // CAD (front view 6.8 MM); CAD-MEASURED 6.88 (top view)
const THICK = 1.567;                      // CAD 1.5 MM (side view); CAD-MEASURED 1.567 (circle fits) / 1.617 (polar profile)
const OPENING = 5.0;                       // CAD (side view 5.0 MM); CAD-MEASURED 5.13 (thin post sector 53°)
const R_OUT = OUTER_D / 2, R_IN = R_OUT - THICK;
const HALF = Math.asin((OPENING / 2) / R_OUT);
const A_START = Math.PI / 2 + HALF, A_END = Math.PI / 2 - HALF + Math.PI * 2;   // body runs the long way round, opening at the top
const HINGE_ANGLE = THREE.MathUtils.degToRad(300.4); // CAD-MEASURED: pin hole centre at 300.4°
const HINGE_RAD = 4.99;                    // CAD-MEASURED: pin hole centre r 4.99 mm (mid-wall)
const KNUCKLE_R = 0.95;                    // CAD-MEASURED: hinge disc ≈ 1.8 (close-up) - 2.15 (loose fit) mm across
const PIN_R = 0.215;                       // CAD-MEASURED: pin hole 0.43 mm across
const HINGE_X = HINGE_RAD * Math.cos(HINGE_ANGLE), HINGE_Y = HINGE_RAD * Math.sin(HINGE_ANGLE);
const HOOP = buildHoop({
  R_IN, A_START, A_END, STEP: THREE.MathUtils.degToRad(0.5),
  BORES: [{ x: HINGE_X, y: HINGE_Y, r: PIN_R, CUT: 0.08 }],   // band opened along the pin hole so it is see-through (cut edge hidden in the knuckle)
  profile: {
    THICK, WIDTH,
    EDGE: 0.42,       // CAD-MEASURED: top view, both ends recede 1.12-1.19 mm from the crown to the edge
    DOME_N: 1.8,      // CAD-MEASURED: superellipse fits the top-view profile within ~0.06 mm (ellipse under-shoots the shoulders)
    RC: 0.25,         // ASSUMED: inner corner radius
    N_DOME: 64, N_CORNER: 8,
    // inner channel carved into the band (CAD perspective view shows the inside hollowed, rims at the edges)
    RIM: 0.45,        // ASSUMED: thin rims read off the perspective view (reference note: shell wall >= 0.30 mm)
    CH_DEPTH: 0.61,   // WEIGHT-FIT: CAD table 18k 5.3 g/pair (171 mm³ per earring); leaves ≥0.80 mm behind the floor.
                      // NOTE: that is 3.5 g/pair in silver; the reference note asks for <= 3 g -> CH_DEPTH 0.85 (shell >= 0.67)
    N_CH: 48,
  },
});
// Post: where the earring goes through the ear (used by the Fitting Room to put this point in the piercing).
const POST_DIA = 0.88;                     // CAD-MEASURED: thin post sector 0.879 mm
const POST_R = 4.85;                       // CAD-MEASURED: post spans r 4.41-5.28 mm, through the middle of the wall

export const info = {
  id: 'kd134', sku: 'KD-134', name: 'Chunky huggie', kind: 'earring', fit: 'huggie',
  // middle of the post across the opening, and the post's direction (it runs through the lobe along this axis)
  pierce: { point: [0, POST_R, 0], axis: [1, 0, 0] },
  metals: METALS,
};

// Builds the earring. metal: material for the gold/silver parts. engrave (optional, viewer only): material for the
// "SO 925" hallmark inside the band (its text texture needs a canvas, so the viewer makes it).
export function build({ metal, engrave = null } = {}) {
  const bandMat = metal;
  const jewel = new THREE.Group();
  jewel.add(new THREE.Mesh(HOOP.band, bandMat), new THREE.Mesh(HOOP.caps, bandMat));

  // Post: thin wire across the opening, from one end into the hole in the other (clicker)
  const a0 = A_END - Math.PI * 2, a1 = A_START;
  const postGeo = new THREE.TorusGeometry(POST_R, POST_DIA / 2, 16, 64, (a1 - a0) + 0.12);
  postGeo.rotateZ(a0 - 0.06);                // overlaps 0.06 rad into each end
  jewel.add(new THREE.Mesh(postGeo, bandMat));
  // Rounded tips: the torus segment is open-ended. Buried in a solid body that was invisible, but the carved channel
  // exposes ~45% of each end ring, which read as a cut-off tube. A sphere of the wire's radius closes each end exactly.
  for (const ang of [a0 - 0.06, a1 + 0.06]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(POST_DIA / 2, 32, 16), bandMat);
    tip.position.set(POST_R * Math.cos(ang), POST_R * Math.sin(ang), 0);
    jewel.add(tip);
  }

  // Hinge knuckle (CV-fitted): tube across the band width, centred mid-wall at 300°
  // Knuckle is a tube: real through-hole for the pin. Ends stand 0.02 mm proud of the band sides; flush faces sat in
  // the same plane as the band edge, which then showed through as a line (z-fighting).
  const knuckle = new THREE.Mesh(knuckleGeometry({ R: KNUCKLE_R, r: PIN_R, LENGTH: WIDTH + 0.04, SEG: 96,
    SEAMS: [-(WIDTH / 2 - 0.45), WIDTH / 2 - 0.45],             // hinge-joint seams aligned with the channel edges (±2.95 mm)
    SEAM_W: 0.05, SEAM_D: 0.04 }), bandMat);   // plain cylinder, flat ends
  knuckle.position.set(HINGE_X, HINGE_Y, 0);
  jewel.add(knuckle);

  if (engrave) {
    // ---------- Hallmark (same convention as KD-116): "SO" brand placeholder + 925 ----------
    // on the channel floor, following its gentle curve across the width (the 0.45 mm rims are too narrow for the stamp)
    const CH_HW = WIDTH / 2 - 0.45, CH_D = 0.61;
    const hallmark = new THREE.Mesh(hallmarkGeometry({ R: z => R_IN + CH_D * Math.sqrt(Math.max(0, 1 - (z / CH_HW) ** 2)) - 0.003,
      THETA_C: HALLMARK_ANGLE, ARC_MM: 2.2, HEIGHT_MM: 0.55, NS: 60, NT: 8 }), engrave);
    hallmark.renderOrder = 5;
    jewel.add(hallmark);
  }
  return jewel;
}
export const HALLMARK_ANGLE = THREE.MathUtils.degToRad(245);   // inner channel floor, lower left, clear of the knuckle (≈288-313°)
