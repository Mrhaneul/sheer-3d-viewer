import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSurface, unpackTopology, granulation } from './disc.js';
import OUTLINE from './outline.json';
import TOPO from './disc_topology.json';   // precomputed triangulation (gen_topology.mjs; cdt2d is too slow for page load)

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
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(19, 7, 42);          // front three-quarter view of the 18 mm disc

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

// ---------- KD-136 dimensions (Karma CAD sheet, 25 Aug 2026; mm) ----------
// Labels: CAD = printed; CAD-MEASURED = measured from the sheet by CV; WEIGHT-FIT; ASSUMED = not specified.
// Outline + hole: CAD-MEASURED. Traced from the front view (background = white flood-filled from the border, so
// highlights inside the disc stay metal; dimension lines removed), scaled from the printed 17.0 mm (disc measures
// 17.00 wide); Fourier-smoothed, within 0.08 mm of the traced pixels. Hole 22.9 mm² (5.4 mm equiv.), off-centre.
const DISC = {
  outer: OUTLINE.outer, hole: OUTLINE.hole,
  T: 1.439,                 // WEIGHT-FIT: plateau thickness so disc + ring = CAD 18k 4.5 g (290.3 mm³); silver comes out 3.0 g (CAD 2.9)
  WARP: 0.0,                  // CAD-MEASURED: side-view silhouette fits best with no bending (RMS 0.11 mm vs 0.15+ with any)
  TVAR: 0.08,                 // ASSUMED: gentle thickness variation (seeded, stable)
  SOFT: 0.06,                 // DECIDED (Haneul 2026-10-08): soft 5-10 mm undulation over the face, no pits
  DENT: 0.10, ZONE: { x: 4.20, y: -5.37, r: 3.5 },   // hammer dents ONLY in the bottom-right zone (CAD front view), Gaussian fade
  BUMPS: granulation(OUTLINE.outer, 5, -80, -25, 16),   // ASSUMED placement: cast granulation inside the lower-right edge (CAD front view)
};
const disc = new THREE.Mesh(buildSurface(unpackTopology(TOPO), DISC).geometry, bandMat);   // ~0.13 s (was ~2.6 s)
// Jump ring through the hole, perpendicular to the disc. Size CAD-MEASURED: OD 8.9 (side view) / 9.3 (front view) -> 9.1;
// wire 1.15 / 1.25 -> 1.2. Position: the hole's top edge rests inside the ring (physical). The CAD picture shows the ring
// ~1 mm higher (printed 21.0 mm overall), which would put the wire through the metal above the hole: confirm with Karma.
const RING = { OD: 9.1, WIRE: 1.2, X: -0.288, Y: 6.595 };
const ringGeo = new THREE.TorusGeometry((RING.OD - RING.WIRE) / 2, RING.WIRE / 2, 24, 96); ringGeo.rotateY(Math.PI / 2);   // plane y-z
const ring = new THREE.Mesh(ringGeo, bandMat); ring.position.set(RING.X, RING.Y, 0);
const jewel = new THREE.Group();
jewel.add(disc, ring);
jewel.position.y = -1.5;                                   // centre the whole piece (ring top +11.1, disc bottom -8.9)
scene.add(jewel);

// ---------- Contact shadow ----------
const shCanvas = document.createElement('canvas'); shCanvas.width = shCanvas.height = 256;
const sctx = shCanvas.getContext('2d');
const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
grad.addColorStop(0, 'rgba(30,28,24,0.34)'); grad.addColorStop(0.55, 'rgba(30,28,24,0.10)'); grad.addColorStop(1, 'rgba(30,28,24,0)');
sctx.fillStyle = grad; sctx.fillRect(0, 0, 256, 256);
const shTex = new THREE.CanvasTexture(shCanvas); shTex.colorSpace = THREE.SRGBColorSpace;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -12; shadow.scale.set(1.3, 0.9, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 24; controls.maxDistance = 90;   // scaled to the 20 mm piece
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
  btnGold.classList.toggle('active', name === 'gold'); btnSilver.classList.toggle('active', name === 'silver');
}
btnGold.addEventListener('click', () => setMetal('gold'));
btnSilver.addEventListener('click', () => setMetal('silver'));

// ---------- Loop ----------
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
