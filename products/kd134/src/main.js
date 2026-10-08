import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { hallmarkGeometry } from './hallmark.js';
import { buildHoop, knuckleGeometry } from './hoop.js';

const stage = document.getElementById('stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer ----------
function showNotice(msg) {
  const n = document.createElement('div');
  n.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;font-size:13px;line-height:1.6;color:#8a8880;padding:16px 20px;';
  n.textContent = msg; document.body.appendChild(n);
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  showNotice('WebGL could not start in this tab. Reload the page (or close other 3D previews) and open the viewer again.');
  throw e;
}
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showNotice('The graphics context was lost. Reload the page to restart the viewer.');
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.2;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(23.4, 3.1, 16.5);   // KD-116 camera angle, distance ×0.96 for the 11.5 mm hoop

// ---------- Environment: studio room + a few crisp softboxes ----------
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new RoomEnvironment();
function box(w, h, color, x, y, z, rx, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); envScene.add(m);
}
box(6, 0.4, 0xffffff, 0, 6.9, 2, -Math.PI / 2, 0);                 // thin bright strip overhead → crisp edge highlights
box(1.2, 5, 0xffffff, -6.9, 1, 1.5, 0, Math.PI / 2);                // tall key strip, left
box(4, 3, 0x333333, 0, 1, -6.9, 0, 0);                              // soft dark patch behind → gentle bands, not black
box(5, 4, 0xffffff, 0, 1.5, 6.9, 0, Math.PI);                       // large front softbox → high-key fill like the reference
scene.environment = pmrem.fromScene(envScene, 0.0).texture;
scene.environmentIntensity = 1.35;
// NOTE: a photographed HDRI (Poly Haven studio_small_03) was tried and rejected: it is a dark studio, and
// near-mirror gold reflects its black walls. A bright synthetic room with a few crisp softboxes reads better.

const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-7, 12, 9); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(8, 3, -7); scene.add(rim);

// ---------- Materials ----------
const METALS = {
  gold:   { color: 0xf2d4a2, roughness: 0.05 },   // champagne 14k: hue ≈38°, sat ≈0.33 (per Joyce's reference; was 0xeed283, 8° greener)
  silver: { color: 0xc9cbcf, roughness: 0.06 },
};
const bandMat = new THREE.MeshPhysicalMaterial({
  color: METALS.gold.color, metalness: 1.0, roughness: METALS.gold.roughness, envMapIntensity: 1.5,
});

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
const jewel = new THREE.Group();
jewel.add(new THREE.Mesh(HOOP.band, bandMat), new THREE.Mesh(HOOP.caps, bandMat));

// Post: thin wire across the opening, from one end into the hole in the other (clicker)
const POST_DIA = 0.88;                     // CAD-MEASURED: thin post sector 0.879 mm
const POST_R = 4.85;                       // CAD-MEASURED: post spans r 4.41-5.28 mm, through the middle of the wall
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

// ---------- Hallmark (same convention as KD-116): "SO" brand placeholder + 925 ----------
const HALLMARK_TEXT = 'SO 925';
const HALLMARK_ANGLE = THREE.MathUtils.degToRad(245);   // inner channel floor, lower left, clear of the knuckle (≈288-313°)
function hallmarkTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 220;
  const font = sz => `600 ${sz}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  x.font = font(size);
  while (x.measureText(text).width > 940 && size > 60) { size -= 6; x.font = font(size); }
  x.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const ENGRAVE_SHADE = 0.62;
const engraveMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(METALS.gold.color).multiplyScalar(ENGRAVE_SHADE), metalness: 1.0, roughness: 0.45,
  envMapIntensity: 1.0, alphaMap: hallmarkTexture(HALLMARK_TEXT), transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
// on the channel floor, following its gentle curve across the width (the 0.45 mm rims are too narrow for the stamp)
const CH_HW = WIDTH / 2 - 0.45, CH_D = 0.61;
const hallmark = new THREE.Mesh(hallmarkGeometry({ R: z => R_IN + CH_D * Math.sqrt(Math.max(0, 1 - (z / CH_HW) ** 2)) - 0.003,
  THETA_C: HALLMARK_ANGLE, ARC_MM: 2.2, HEIGHT_MM: 0.55, NS: 60, NT: 8 }), engraveMat);
hallmark.renderOrder = 5;
jewel.add(hallmark);

jewel.rotation.set(0, 0, 0);
scene.add(jewel);

// ---------- Contact shadow ----------
const shCanvas = document.createElement('canvas'); shCanvas.width = shCanvas.height = 256;
const sctx = shCanvas.getContext('2d');
const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
grad.addColorStop(0, 'rgba(30,28,24,0.34)'); grad.addColorStop(0.55, 'rgba(30,28,24,0.10)'); grad.addColorStop(1, 'rgba(30,28,24,0)');
sctx.fillStyle = grad; sctx.fillRect(0, 0, 256, 256);
const shTex = new THREE.CanvasTexture(shCanvas); shTex.colorSpace = THREE.SRGBColorSpace;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -7.8; shadow.scale.set(0.95, 0.75, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 15; controls.maxDistance = 50;   // scaled ×0.96 from KD-116
controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI - 0.35;
controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.9;
const hint = document.getElementById('hint');
let idleTimer = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; hint.classList.add('gone'); clearTimeout(idleTimer); });
controls.addEventListener('end', () => { idleTimer = setTimeout(() => { controls.autoRotate = !reduceMotion; }, 2500); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Metal toggle ----------
const btnGold = document.getElementById('btnGold'), btnSilver = document.getElementById('btnSilver');
function setMetal(name) {
  const m = METALS[name]; bandMat.color.setHex(m.color); bandMat.roughness = m.roughness;
  engraveMat.color.setHex(m.color).multiplyScalar(ENGRAVE_SHADE);   // hallmark follows the metal
  btnGold.classList.toggle('active', name === 'gold'); btnSilver.classList.toggle('active', name === 'silver');
}
btnGold.addEventListener('click', () => setMetal('gold'));
btnSilver.addEventListener('click', () => setMetal('silver'));

// ---------- Loop ----------
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
