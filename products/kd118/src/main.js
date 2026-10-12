import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { marquiseBrilliant, basketGeometry, clawsGeometry, postGeometry } from './stud.js';
import { MeshTransmissionMaterialImpl } from '../../../src/MeshTransmissionMaterialImpl.js';   // shared with KD-116 (one copy in the repo)

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
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(5.2, 2.2, 6.8);       // front three-quarter view of the small stud

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

// Separate environment for the stones (neutral 'diamond studio')
const gemEnvScene = new THREE.Scene();
gemEnvScene.background = new THREE.Color(0x141414);
function gbox(w, h, color, x, y, z, rx, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); gemEnvScene.add(m);
}
// 12 sectors around the horizon (4 black), bright overhead with a dark centre, dark floor,
// and a dark zone toward the camera (viewer's head shadow) → ~10% dark facets, like reference renders.
for (let i = 0; i < 12; i++) {
  const az = i * (Math.PI / 6);
  const dark = (i % 3 === 1);                                        // 4 of 12 sectors black → ~10% dark facets
  gbox(3.4, 12, dark ? 0x0a0a0a : 0xffffff, 6.4 * Math.sin(az), 0, 6.4 * Math.cos(az), 0, az);
}
gbox(14, 14, 0xffffff, 0, 7.5, 0, -Math.PI / 2, 0);                 // white overhead
gbox(3, 3, 0x0a0a0a, 0, 7.4, 0, -Math.PI / 2, 0);                   // dark centre overhead
gbox(14, 14, 0x303030, 0, -7.5, 0, Math.PI / 2, 0);                 // dark floor
gbox(4, 4, 0x050505, 0, 1.5, 7.3, 0, Math.PI);                      // head shadow toward +Z (camera side)
const gemEnv = pmrem.fromScene(gemEnvScene, 0.0).texture;


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

// Stones: KD-116's deep two-pass mode (default) with its single-pass physical material as the 'standard' fallback.
// Default stone material: physically based transmission (runs everywhere)
const stonePhysMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0.0,
  transmission: 0.12, ior: 2.2, thickness: 1.2, dispersion: 0.8,
  specularIntensity: 1.0, specularColor: new THREE.Color(0xffffff),
  envMap: gemEnv, envMapIntensity: 1.25, side: THREE.DoubleSide,
  iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600],
  attenuationColor: new THREE.Color(0xffffff), attenuationDistance: 8,
});
// ---------- Round brilliant cut: 57 facets, 8-fold symmetry ----------
function brilliantGeometry(r) {
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

// Deep stone material: crown (front faces) refracts an image of the pavilion (back faces) rendered as mirror facets.
const FBO_SIZE = 1024;
const fboMain = new THREE.WebGLRenderTarget(FBO_SIZE, FBO_SIZE, { type: THREE.HalfFloatType });
const stoneMat = new MeshTransmissionMaterialImpl(6, false);   // 6 samples (12 was tried for 'dot' artifacts that turned out to be bead-prong geometry; reverted for mobile perf)
Object.assign(stoneMat, {
  color: new THREE.Color(0xffffff), roughness: 0.0, metalness: 0,
  ior: 2.2, thickness: 0.3, chromaticAberration: 0.55,   // small thickness keeps samples inside the stone (no gold spill); aberration = fire
  anisotropicBlur: 0.0, distortion: 0.0,
  envMap: gemEnv, envMapIntensity: 1.5, specularIntensity: 1.0,
  clearcoat: 0.4, clearcoatRoughness: 0.0,
  attenuationColor: new THREE.Color(0xffffff), attenuationDistance: 10,
});
stoneMat._transmission = 0.88; stoneMat.transmission = 0;    // front face: mostly the refracted interior, plus surface reflections
stoneMat.buffer = fboMain.texture;
const stoneBackMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 1.0, roughness: 0.0, side: THREE.BackSide,
  envMap: gemEnv, envMapIntensity: 2.4,
  iridescence: 0.55, iridescenceIOR: 1.4, iridescenceThicknessRange: [380, 720],   // pastel blue/pink flashes on individual facets
  specularIntensity: 1.0,
  depthTest: true, depthWrite: true,   // KD-121: on (see renderStonePasses)
});   // mirror pavilion facets reflecting the stone studio → white interior with dark/bright facet contrast
const passBg = new THREE.Color(0x0e0d0b);   // dark backdrop behind the stones → depth and contrast in the facets
// Pavilion pass draws ONLY the stones (metal hidden), depth test on. Same look as KD-116 (no gold inside a stone),
// but correct when the necklace is turned: KD-116 disabled the depth test, which here would let far-side stones paint
// over near ones; and with metal drawn, a thin sliver of collar inside the girdle showed as gold at oblique angles.
let metalParts = [];
function renderStonePasses() {
  const oldTone = renderer.toneMapping, oldBg = scene.background;
  renderer.toneMapping = THREE.NoToneMapping; scene.background = passBg;
  for (const o of metalParts) o.visible = false;
  stones.material = stoneBackMat;                                                    // mirror pavilion facets (all 245 instances)
  renderer.setRenderTarget(fboMain); renderer.render(scene, camera);
  for (const o of metalParts) o.visible = true;
  stones.material = stoneMat;                                                        // transparent crown refracts the pavilion image
  stoneMat.buffer = fboMain.texture; stoneMat.side = THREE.FrontSide;
  scene.background = oldBg; renderer.setRenderTarget(null); renderer.toneMapping = oldTone;
}
// ---------- KD-118 dimensions (Karma CAD sheet, 18 Aug 2026; mm) ----------
// Labels: CAD = printed; CAD-MEASURED = measured from the sheet; ASSUMED = not specified, confirm with Karma.
// Four-prong marquise stud, built like KD-117 (smooth claws that curl over the stone and merge into the basket's
// rounded back edge). Stud axis along z (stone toward the viewer), z = 0 at the prong tips; marquise long axis = y.
const STONE_L = 2.0, STONE_W = 1.0;        // CAD (marquise 2 x 1 mm; front view measures 1.87 x 0.96). Carat: CAD 0.012 ct
                                           // "Estimated"; the warped round brilliant models 0.0064 ct (as KD-115's pear, low)
const DEPTH = 1.6;                         // CAD (side view 1.6 MM): prong tips to the back of the basket
const Z_GIRDLE = -0.45;                    // CAD-MEASURED: side view, the stone sits recessed ~0.3 mm behind the claw tips
const jewel = new THREE.Group();
const stoneGeo = marquiseBrilliant(brilliantGeometry(STONE_W / 2), STONE_L, STONE_W);           // table toward the viewer
const stones = new THREE.Mesh(stoneGeo, stoneMat); stones.position.z = Z_GIRDLE;
const basketGeo = basketGeometry({ L: STONE_L, W: STONE_W, OFF: 0.07,   // CAD-MEASURED: thin collar ~0.07 mm outside the girdle
  Z_GIRDLE, DEPTH, PAV_DEPTH: 0.43 * STONE_W, CLEAR: 0.2, LIP: 0.04, FILLET: 0.2, NPHI: 192 });
// Claws: tip claws cap the two points (front view: teardrops reaching the printed 2.8 MM); side claws reach the printed
// 1.6 MM width. Curls solved so each tip rests 5 um above the crown; bends exceed the wire radius (no folding).
const CLAWS = { DEPTH, BACK_IN: 0.02, SEG: 160, CLAWS: [
  ...[0, Math.PI].map(ANG => ({ ANG, R_AXIS: 1.22, WIRE: 0.18, BEND: 0.22, END_ANG: 2.1015, BEND_B: 0.22, STUB: 0.25 })),
  ...[Math.PI / 2, 3 * Math.PI / 2].map(ANG => ({ ANG, R_AXIS: 0.63, WIRE: 0.17, BEND: 0.21, END_ANG: 1.6086, BEND_B: 0.21, STUB: 0.2 })),
] };
const POST = { DIA: 0.73, LEN: 5.2, Z0: -DEPTH + 0.1 };   // CAD-MEASURED (side view): 0.73 mm wire, 5.2 mm long
jewel.add(stones, new THREE.Mesh(basketGeo, bandMat), new THREE.Mesh(clawsGeometry(CLAWS), bandMat), new THREE.Mesh(postGeometry(POST), bandMat));
jewel.position.z = 1.5;                    // centre the view on the setting with the post trailing back
jewel.rotation.set(0, 0, 0);
scene.add(jewel);
metalParts = jewel.children.filter(o => o !== stones);   // everything but the stone is hidden during the pavilion pass

// ---------- Contact shadow ----------
const shCanvas = document.createElement('canvas'); shCanvas.width = shCanvas.height = 256;
const sctx = shCanvas.getContext('2d');
const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
grad.addColorStop(0, 'rgba(30,28,24,0.34)'); grad.addColorStop(0.55, 'rgba(30,28,24,0.10)'); grad.addColorStop(1, 'rgba(30,28,24,0)');
sctx.fillStyle = grad; sctx.fillRect(0, 0, 256, 256);
const shTex = new THREE.CanvasTexture(shCanvas); shTex.colorSpace = THREE.SRGBColorSpace;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.0; shadow.scale.set(0.3, 0.3, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 3.5; controls.maxDistance = 20;   // scaled to the 2.8 mm setting
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

// ---------- Stone mode toggle (as KD-116): deep two-pass vs standard single-pass ----------
let deepStones = true;
const btnRT = document.createElement('button'); btnRT.textContent = 'Stones: deep';
document.querySelector('.metals').appendChild(btnRT);
btnRT.addEventListener('click', () => {
  deepStones = !deepStones;
  stones.material = deepStones ? stoneMat : stonePhysMat;
  btnRT.textContent = deepStones ? 'Stones: deep' : 'Stones: standard';
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
renderer.setAnimationLoop(() => { controls.update(); if (deepStones) renderStonePasses(); renderer.render(scene, camera); });
