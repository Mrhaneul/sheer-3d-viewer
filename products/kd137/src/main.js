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
camera.position.set(16.3, 2.1, 11.5);   // KD-116 camera angle, distance scaled ×2/3 for the 8 mm hoop (vs 12 mm)

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

// ---------- KD-137 dimensions (Karma CAD sheet, 25 Aug 2026; mm) ----------
// Labels: CAD = printed; CAD-MEASURED = pixel-measured from the sheet; ASSUMED = not specified, confirm with Karma.
const OUTER_D = 8.0;                       // CAD (front view 8.0 MM; handwritten "outer dia 8 mm")
const WIDTH = 3.5;                         // CAD (front view 3.5 MM)
const THICK = 1.1;                         // CAD (side view 1.1 MM): peak radial thickness at the dome crown
const OPENING = 3.44;                      // CAD-MEASURED by CV: side-view polar thickness profile, thin post sector = 51° → 3.44 mm chord.
                                           // The sheet PRINTS 4.5 mm, but its own dimension lines span ~3.5 mm at the view's scale; confirm with Karma
const R_OUT = OUTER_D / 2, R_IN = R_OUT - THICK;
const HALF = Math.asin((OPENING / 2) / R_OUT);
const A_START = Math.PI / 2 + HALF, A_END = Math.PI / 2 - HALF + Math.PI * 2;   // body runs the long way round, opening at the top
const HINGE_ANGLE = THREE.MathUtils.degToRad(300);   // CAD-MEASURED by CV: circle fit to the disk edge, 300.0° (fit RMS 14 µm)
const HINGE_RAD = 3.445;                   // CAD-MEASURED by CV: knuckle centre is mid-wall, not on the inner face
const KNUCKLE_R = 0.89;                    // CAD-MEASURED by CV: disk 1.78 mm across; overhangs both the inner and outer ring edge
const PIN_R = 0.265;                       // CAD-MEASURED by CV: pin hole circle fit, 0.53 mm across
const HINGE_X = HINGE_RAD * Math.cos(HINGE_ANGLE), HINGE_Y = HINGE_RAD * Math.sin(HINGE_ANGLE);
const HOOP = buildHoop({
  R_IN, A_START, A_END, STEP: THREE.MathUtils.degToRad(0.5),
  BORES: [{ x: HINGE_X, y: HINGE_Y, r: PIN_R, CUT: 0.08 }],   // band opened along the pin hole so it is see-through (cut edge hidden in the knuckle)
  profile: {
    THICK, WIDTH,
    EDGE: 0.35,       // CAD-MEASURED: top-view silhouette recedes 0.75 mm from crown to edge; elliptical dome fits it (0.6 px RMS)
    RC: 0.25,         // ASSUMED: inner corner radius
    N_DOME: 64, N_CORNER: 8,
    // inner channel carved into the band (CAD perspective view shows the inside hollowed, rims at the edges)
    RIM: WIDTH / 5,   // DECIDED (Haneul 2026-10-06): rim : channel : rim = 1 : 3 : 1 across the width (0.70 / 2.10 / 0.70 mm)
    CH_DEPTH: 0.45,   // WEIGHT-FIT: 0.45 mm lands between the 18k (51.6 mm³) and silver (53.1 mm³) per-earring targets,
                      // leaving ≥0.65 mm of metal behind the channel floor
    N_CH: 48,
  },
});
const jewel = new THREE.Group();
jewel.add(new THREE.Mesh(HOOP.band, bandMat), new THREE.Mesh(HOOP.caps, bandMat));

// Post: thin wire across the opening, from one end into the hole in the other (clicker)
const POST_DIA = 0.66;                     // CAD-MEASURED by CV: radial thickness of the thin sector, 0.666 mm
const POST_R = 3.38;                       // CAD-MEASURED by CV: post spans r 3.05–3.71 mm, i.e. through the middle of the wall (not flush with the outside)
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
  SEAMS: [-(WIDTH / 2 - WIDTH / 5), WIDTH / 2 - WIDTH / 5],   // hinge-joint seams aligned with the channel edges (±1.05 mm)
  SEAM_W: 0.05, SEAM_D: 0.04 }), bandMat);   // plain cylinder, flat ends
knuckle.position.set(HINGE_X, HINGE_Y, 0);
jewel.add(knuckle);

// ---------- Hallmark (same convention as KD-116): "SO" brand placeholder + 925 ----------
const HALLMARK_TEXT = 'SO 925';
const HALLMARK_ANGLE = THREE.MathUtils.degToRad(250);   // bottom-left of the inner face, clear of the hinge knuckle (≈285–315°)
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
// on the channel floor, following its gentle curve across the width (the 0.70 mm rims leave only ≈0.45 mm of flat,
// less than the 0.55 mm stamp height)
const CH_HW = WIDTH / 2 - WIDTH / 5, CH_D = 0.45;
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
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -5.5; shadow.scale.set(0.67, 0.48, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 11; controls.maxDistance = 35;   // scaled ×2/3 with the piece
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
