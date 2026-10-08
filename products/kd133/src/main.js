import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { hallmarkGeometry } from './hallmark.js';
import { buildHoop, knuckleGeometry, roundProfile } from './hoop.js';

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
camera.position.set(26.5, 3.5, 18.7);   // KD-116 camera angle, distance scaled ×13/12 for the 13 mm hoop

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

// ---------- KD-133 dimensions (Karma CAD sheet, 25 Aug 2026; mm) ----------
// Labels: CAD = printed; CAD-MEASURED = measured from the sheet by CV; ASSUMED = not specified, confirm with Karma.
// Thin hinged huggie: round wire, hinge at the bottom, clicker post across the opening at the top. Construction follows
// KD-137 (see-through pin bore, plain-tube knuckle, post with rounded tips).
const OUTER_D = 13.0;                      // CAD (front view 13.0 MM). Note: the reference sheet is titled "THIN HUGGIE - 6 mm"
const WIRE = 1.23;                         // CAD 1.2 MM; CAD-MEASURED 1.228 (side-view circle fits, concentric to 6 um)
const OPENING = 5.0;                       // CAD (side view 5.0 MM); CAD-MEASURED 5.18 (thin post sector 47 deg)
const R_OUT = OUTER_D / 2, R_IN = R_OUT - WIRE, R_MID = R_OUT - WIRE / 2;
const HALF = Math.asin((OPENING / 2) / R_OUT);
const A_START = Math.PI / 2 + HALF, A_END = Math.PI / 2 - HALF + Math.PI * 2;   // body runs the long way round, opening at the top
const HINGE_ANGLE = THREE.MathUtils.degToRad(270);   // CAD-MEASURED: pin hole at 269.9 deg, mid-wire (r 5.89)
const HINGE_X = R_MID * Math.cos(HINGE_ANGLE), HINGE_Y = R_MID * Math.sin(HINGE_ANGLE);
const KNUCKLE_R = 0.75;                    // CAD-MEASURED: hinge disc ≈ 1.44-1.59 mm across, centred on the pin (58 um)
const KNUCKLE_L = 1.89;                    // CAD-MEASURED: front view, the hinge is 1.89 mm across (wire 1.26 there)
const PIN_R = 0.165;                       // CAD-MEASURED: pin hole 0.33 mm across
const HOOP = buildHoop({
  R_IN, A_START, A_END, STEP: THREE.MathUtils.degToRad(0.5),
  BORES: [{ x: HINGE_X, y: HINGE_Y, r: PIN_R, CUT: 0.08 }],   // band opened along the pin hole so it is see-through (cut edge hidden in the knuckle)
  profilePts: roundProfile({ THICK: WIRE, N: 48 }),
});
const jewel = new THREE.Group();
jewel.add(new THREE.Mesh(HOOP.band, bandMat), new THREE.Mesh(HOOP.caps, bandMat));

// Post: thin wire across the opening, from one end into the hole in the other (clicker)
const POST_DIA = 0.68;                     // CAD-MEASURED: thin post sector 0.681 mm
const POST_R = 5.92;                       // CAD-MEASURED: post spans r 5.58-6.26, i.e. through the middle of the wire
const a0 = A_END - Math.PI * 2, a1 = A_START;
const postGeo = new THREE.TorusGeometry(POST_R, POST_DIA / 2, 16, 64, (a1 - a0) + 0.12);
postGeo.rotateZ(a0 - 0.06);                // overlaps 0.06 rad into each end
jewel.add(new THREE.Mesh(postGeo, bandMat));
for (const ang of [a0 - 0.06, a1 + 0.06]) {  // rounded tips close the open torus ends (KD-137 lesson)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(POST_DIA / 2, 32, 16), bandMat);
  tip.position.set(POST_R * Math.cos(ang), POST_R * Math.sin(ang), 0);
  jewel.add(tip);
}
// Hinge knuckle: plain tube across the wire with a real through-hole for the pin; ends stand 0.31 mm proud of the wire
const knuckle = new THREE.Mesh(knuckleGeometry({ R: KNUCKLE_R, r: PIN_R, LENGTH: KNUCKLE_L, SEG: 96 }), bandMat);
knuckle.position.set(HINGE_X, HINGE_Y, 0);
jewel.add(knuckle);

// ---------- Hallmark (same convention as KD-116/137): "SO" brand placeholder + 925 ----------
const HALLMARK_TEXT = 'SO 925';
const HALLMARK_ANGLE = THREE.MathUtils.degToRad(230);   // inner face, lower left, clear of the knuckle (≈263-277 deg)
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
// follows the round wire's inner surface across its height (a flat strip would float 0.05 mm off it at the edges)
const RW = WIRE / 2;
const hallmark = new THREE.Mesh(hallmarkGeometry({ R: z => R_MID - Math.sqrt(Math.max(0, RW * RW - z * z)) - 0.003,
  THETA_C: HALLMARK_ANGLE, ARC_MM: 2.0, HEIGHT_MM: 0.5, NS: 60, NT: 8 }), engraveMat);
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
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -8.5; shadow.scale.set(1.05, 0.75, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 17; controls.maxDistance = 56;   // scaled ×13/12 from KD-116
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
