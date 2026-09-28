import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshTransmissionMaterialImpl } from './MeshTransmissionMaterialImpl.js';

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
camera.position.set(24.5, 3.2, 17.3);   // ≈55° azimuth, slight elevation — the CAD perspective angle

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
const slotMat = new THREE.MeshStandardMaterial({ color: 0x2b2416, metalness: 0.8, roughness: 0.5 });

// Default stone material: physically based transmission (runs everywhere)
const stonePhysMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0.0,
  transmission: 0.12, ior: 2.2, thickness: 1.2, dispersion: 0.8,
  specularIntensity: 1.0, specularColor: new THREE.Color(0xffffff),
  envMap: gemEnv, envMapIntensity: 1.25, side: THREE.DoubleSide,
  iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600],
  attenuationColor: new THREE.Color(0xffffff), attenuationDistance: 8,
});
// Deep stone material: crown (front faces) refracts an image of the pavilion (back faces) rendered as mirror facets.
const FBO_SIZE = 1024;
const fboMain = new THREE.WebGLRenderTarget(FBO_SIZE, FBO_SIZE, { type: THREE.HalfFloatType });
const stoneMat = new MeshTransmissionMaterialImpl(12, false);   // 12 samples: blends chromatic aberration into smooth fire (6 left detached R/B dots)
Object.assign(stoneMat, {
  color: new THREE.Color(0xffffff), roughness: 0.0, metalness: 0,
  ior: 2.2, thickness: 0.3, chromaticAberration: 0.55,   // small thickness keeps samples inside the stone (no gold spill); aberration = fire
  anisotropicBlur: 0.15, distortion: 0.0,   // slight blur smears residual aberration fireflies
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
  depthTest: false, depthWrite: false,   // the stone is embedded in solid gold; paint the interior over it within the stone's outline
});   // mirror pavilion facets reflecting the stone studio → white interior with dark/bright facet contrast
const passBg = new THREE.Color(0x0e0d0b);   // dark backdrop behind the stones → depth and contrast in the facets
function renderStonePasses() {
  const oldTone = renderer.toneMapping, oldBg = scene.background;
  renderer.toneMapping = THREE.NoToneMapping; scene.background = passBg;
  stoneMeshes.forEach(m => { m.material = stoneBackMat; });                        // white interior facets
  renderer.setRenderTarget(fboMain); renderer.render(scene, camera);
  stoneMeshes.forEach(m => { m.material = stoneMat; });                            // transparent front refracts the white interior
  stoneMat.buffer = fboMain.texture; stoneMat.side = THREE.FrontSide;
  scene.background = oldBg; renderer.setRenderTarget(null); renderer.toneMapping = oldTone;
}
const edgeMat = new THREE.LineBasicMaterial({ color: 0x8f9bb0, transparent: true, opacity: 0.22 });

// ---------- Dimensions from CAD sheet KD-116 (mm) ----------
const OUTER_D = 12.0, THICK = 1.5, WIDTH = 1.7, POST = 5.0, STONE_D = 1.5;
const R_OUT = OUTER_D / 2, R_IN = R_OUT - THICK, R_MID = R_OUT - THICK / 2;
const OPEN_HALF = Math.asin((POST / 2) / R_MID);
const A_START = Math.PI / 2 + OPEN_HALF;                 // hinge end ≈ 118°
const A_END = Math.PI / 2 - OPEN_HALF + Math.PI * 2;     // clasp end ≈ 62° + 360°

const STONES = 7;
const PITCH = THREE.MathUtils.degToRad(17.8);
const S_A0 = THREE.MathUtils.degToRad(129);
const SEAM = S_A0 + PITCH * (STONES - 1) + THREE.MathUtils.degToRad(11);
const CUT_R = 0.86;                       // scoop radius (axis across the band width)
const CUT_C = R_OUT + 0.46;               // scoop centre outside the band → shallow dip, small flat between scoops
const STONE_C = R_OUT - 0.34;             // girdle just under the scoop rim, table slightly proud
const stoneAngles = []; for (let i = 0; i < STONES; i++) stoneAngles.push(S_A0 + PITCH * i);

// ---------- Pavé section: scalloped side profile extruded across the width ----------
function outerRadiusAt(theta) {
  let r = R_OUT;
  for (const a of stoneAngles) {
    const cu = CUT_C * Math.cos(theta - a);
    const disc = cu * cu - (CUT_C * CUT_C - CUT_R * CUT_R);
    if (disc > 0) { const rin = cu - Math.sqrt(disc); if (rin > 0 && rin < r) r = rin; }
  }
  return r;
}
const pts = [];
const STEP = THREE.MathUtils.degToRad(0.35);
for (let t = A_START; t <= SEAM + 1e-9; t += STEP) { const rr = outerRadiusAt(t); pts.push(new THREE.Vector2(rr * Math.cos(t), rr * Math.sin(t))); }
for (let t = SEAM; t >= A_START - 1e-9; t -= STEP * 3) pts.push(new THREE.Vector2(R_IN * Math.cos(t), R_IN * Math.sin(t)));
const BEV = 0.09;   // must stay well below the scoop radius or the offset outline pinches into fins
const paveGeo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
  depth: WIDTH - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelOffset: -BEV, bevelSegments: 4, steps: 1,
});
paveGeo.translate(0, 0, -(WIDTH - 2 * BEV) / 2);
const paveSmooth = toCreasedNormals(paveGeo, THREE.MathUtils.degToRad(32));

// ---------- Plain section: rounded comfort profile swept along the remaining arc ----------
class ArcCurve extends THREE.Curve {
  constructor(r, a0, a1) { super(); this.r = r; this.a0 = a0; this.a1 = a1; }
  getPoint(t, target = new THREE.Vector3()) { const a = this.a0 + (this.a1 - this.a0) * t; return target.set(this.r * Math.cos(a), this.r * Math.sin(a), 0); }
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const plainGeo = new THREE.ExtrudeGeometry(roundedRectShape(THICK, WIDTH, 0.60), {
  steps: 260, bevelEnabled: false, curveSegments: 8, extrudePath: new ArcCurve(R_MID, SEAM, A_END),
});
const plainSmooth = toCreasedNormals(plainGeo, THREE.MathUtils.degToRad(32));

const jewel = new THREE.Group();
jewel.add(new THREE.Mesh(paveSmooth, bandMat), new THREE.Mesh(plainSmooth, bandMat));

// ---------- Post and clasp slot ----------
// NOTE: the CAD sheet shows a straight 5.0 mm post; the curved wire below follows the reference product photo. Confirm with Karma.
// Post: round wire following the hoop's curve across the opening (as on the reference piece)
const POST_R = R_MID - 0.05, POST_TUBE = 0.36;
const a0 = A_END - Math.PI * 2, a1 = A_START;                // 62° → 118° across the top
const postGeo = new THREE.TorusGeometry(POST_R, POST_TUBE, 20, 48, (a1 - a0) + 0.12);
postGeo.rotateZ(a0 - 0.06);                                   // slight overlap into both hoop ends
const post = new THREE.Mesh(postGeo, bandMat); jewel.add(post);
const postCap = new THREE.Mesh(new THREE.SphereGeometry(POST_TUBE, 20, 14), bandMat);
postCap.position.set(POST_R * Math.cos(a1 + 0.02), POST_R * Math.sin(a1 + 0.02), 0); jewel.add(postCap);
const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.9), slotMat);
slot.position.set(POST_R * Math.cos(a0 + 0.03), POST_R * Math.sin(a0 + 0.03), 0); jewel.add(slot);

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
const gemGeo = brilliantGeometry(STONE_D / 2);
const gemEdges = new THREE.EdgesGeometry(gemGeo, 8);
const up = new THREE.Vector3(0, 1, 0);
const radial = a => new THREE.Vector3(Math.cos(a), Math.sin(a), 0);

for (const a of stoneAngles) {
  const dir = radial(a);
  const s = new THREE.Group();
  const gm = new THREE.Mesh(gemGeo, stoneMat); gm.userData.isStone = true; gm.renderOrder = 10; s.add(gm);
  s.add(new THREE.LineSegments(gemEdges, edgeMat));
  s.position.copy(dir).multiplyScalar(STONE_C);
  s.quaternion.setFromUnitVectors(up, dir);
  s.rotateY(a * 3.1);
  jewel.add(s);
}
// Bead prongs at the cusps between scoops, both edges of the band.
// OFF per Joyce/Haneul review 2026-09-28 (read as stray dots, not prongs). Flip SHOW_BEADS to restore;
// real prong geometry will come from the Karma CAD anyway.
const SHOW_BEADS = false;
if (SHOW_BEADS) {
  const beadGeo = new THREE.SphereGeometry(0.15, 16, 12);
  for (let i = 0; i <= STONES; i++) {
    const a = S_A0 + PITCH * (i - 0.5), dir = radial(a);
    [-0.62, 0.62].forEach(z => {
      const p = new THREE.Mesh(beadGeo, bandMat);
      p.position.copy(dir).multiplyScalar(R_OUT + 0.02); p.position.z = z;
      jewel.add(p);
    });
  }
}

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
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -8.2; shadow.scale.set(1, 0.72, 1);
scene.add(shadow);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 16; controls.maxDistance = 52;
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

// ---------- Stone mode toggle: deep (transmission + backside) vs standard ----------
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
let deepStones = true;
const stoneMeshes = []; jewel.traverse(o => { if (o.userData.isStone) stoneMeshes.push(o); });
const btnRT = document.createElement('button');
btnRT.id = 'btnRT'; btnRT.textContent = 'Stones: deep';
document.querySelector('.metals').appendChild(btnRT);
btnRT.addEventListener('click', () => {
  deepStones = !deepStones;
  stoneMeshes.forEach(m => { m.material = deepStones ? stoneMat : stonePhysMat; });
  btnRT.textContent = deepStones ? 'Stones: deep' : 'Stones: standard';
});
try { (console.log || function(){})('GPU:', gpuName); } catch (e) {}

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
