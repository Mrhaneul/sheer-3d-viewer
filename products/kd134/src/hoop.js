import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Hinged domed hoop geometry, from KD-137, with a superellipse dome option added for KD-134. Pure geometry, no DOM.
// Labels: CAD = printed on the sheet, CAD-MEASURED = pixel-measured from the sheet, WEIGHT-FIT = tuned so the
// mesh volume matches the CAD metal weight, ASSUMED = not specified, needs confirmation.

// Cross-section loop in (u, v): u = radial distance outward from the inner face, v = axial (across the width).
// Flat inner face with rounded inner corners, straight side walls, and an elliptical dome on the outside whose
// tangent is vertical where it meets the side walls (so the edge is smooth, not creased). CCW in (u, v).
export function domedProfile(p) {
  // p: { THICK (peak radial thickness), WIDTH, EDGE (thickness at the side wall), RC (inner corner radius), N_DOME, N_CORNER,
  //      CH_DEPTH? (inner channel depth at centre), RIM? (rim width each side), N_CH? (channel samples) }
  const hv = p.WIDTH / 2, pts = [];
  const n = p.DOME_N || 2, sp = x => Math.sign(x) * Math.pow(Math.abs(x), 2 / n);   // DOME_N: superellipse exponent (2 = ellipse)
  for (let k = 0; k <= p.N_DOME; k++) {                       // dome: v from -hv to +hv
    const phi = -Math.PI / 2 + Math.PI * k / p.N_DOME;
    pts.push([p.EDGE + (p.THICK - p.EDGE) * sp(Math.cos(phi)), hv * sp(Math.sin(phi))]);
  }
  for (let k = 1; k <= 3; k++) pts.push([p.EDGE * (1 - k / 4) + p.RC * (k / 4), hv]);   // +v side wall down to corner
  for (let k = 0; k <= p.N_CORNER; k++) {                   // inner corner at +v
    const a = (k / p.N_CORNER) * (Math.PI / 2);
    pts.push([p.RC - p.RC * Math.sin(a), hv - p.RC + p.RC * Math.cos(a)]);
  }
  if (p.CH_DEPTH > 0) {
    // carved inner channel (2026-10-06, per the CAD perspective view): flat rims of width RIM along each edge, and
    // between them an elliptical channel cut CH_DEPTH deep into the band at its centre, open toward the hoop centre
    const hw = hv - p.RIM;
    for (let k = 1; k <= 3; k++) pts.push([0, (hv - p.RC) - (hv - p.RC - hw) * k / 3]);    // +v rim face
    for (let k = 1; k < p.N_CH; k++) {                                                        // channel floor, +v -> -v
      const phi = Math.PI / 2 - Math.PI * k / p.N_CH;
      pts.push([p.CH_DEPTH * Math.cos(phi), hw * Math.sin(phi)]);
    }
    for (let k = 0; k < 3; k++) pts.push([0, -hw - (hv - p.RC - hw) * k / 3]);                // -v rim face (last point = corner start; not repeated)
  } else {
    for (let k = 1; k <= 7; k++) pts.push([0, (hv - p.RC) * (1 - 2 * k / 8)]);              // flat inner face
  }
  for (let k = 0; k <= p.N_CORNER; k++) {                   // inner corner at -v
    const a = (k / p.N_CORNER) * (Math.PI / 2);
    pts.push([p.RC - p.RC * Math.cos(a), -hv + p.RC - p.RC * Math.sin(a)]);
  }
  for (let k = 1; k <= 3; k++) pts.push([p.RC * (1 - k / 4) + p.EDGE * (k / 4), -hv]);  // -v side wall up
  return pts;
}

export function buildHoop(c) {
  // c: { R_IN, A_START, A_END, STEP, profile, BORES?: [{x, y, r, CUT}] }
  const prof = domedProfile(c.profile), N = prof.length;
  const thetas = [];
  for (let t = c.A_START; t < c.A_END; t += c.STEP) thetas.push(t);
  thetas.push(c.A_END);
  const M = thetas.length, pos = new Float32Array(M * N * 3);
  for (let j = 0; j < M; j++) {
    const ct = Math.cos(thetas[j]), st = Math.sin(thetas[j]);
    for (let i = 0; i < N; i++) {
      const r = c.R_IN + prof[i][0];
      pos.set([r * ct, r * st, prof[i][1]], (j * N + i) * 3);
    }
  }
  let idx = [];
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + (i + 1) % N, cc = (j + 1) * N + i, d = (j + 1) * N + (i + 1) % N;
    idx.push(a, cc, b, b, cc, d);
  }
  // through-bores along z (hinge pin hole): DELETE band triangles that touch the bore (+ CUT margin). Pushing vertices
  // aside only stretches triangles across the hole; deleting them opens it. The ragged cut edge lies inside the
  // hinge knuckle tube (outer radius > CUT), so it is never visible; looking through the bore you see the tube's wall.
  if (c.BORES && c.BORES.length) {
    const inBore = v => c.BORES.some(b => Math.hypot(pos[3 * v] - b.x, pos[3 * v + 1] - b.y) < b.r + b.CUT);
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (!(inBore(idx[t]) || inBore(idx[t + 1]) || inBore(idx[t + 2]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    idx = keep;   // reassign (spreading 300k+ indices into push() overflows the call stack)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // flat end caps. The section can be non-convex (inner channel), so triangulate it properly (a fan from the centroid
  // would bridge across the channel) and orient every triangle to face OUT (KD-116 lesson: inward caps render open).
  const tris2d = THREE.ShapeUtils.triangulateShape(prof.map(([u, v]) => new THREE.Vector2(u, v)), []);
  const caps = [];
  [[0, -1], [M - 1, 1]].forEach(([j, dir]) => {
    const th = thetas[j], out = [-Math.sin(th) * dir, Math.cos(th) * dir, 0];    // outward = along the sweep, away from the body
    const V = i => [pos[(j * N + i) * 3], pos[(j * N + i) * 3 + 1], pos[(j * N + i) * 3 + 2]];
    for (const [a, b, cI] of tris2d) {
      const A = V(a), B = V(b), C = V(cI);
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) caps.push(...A, ...B, ...C); else caps.push(...A, ...C, ...B);
    }
  });
  const capG = new THREE.BufferGeometry();
  capG.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  capG.computeVertexNormals();
  return { band: g, caps: capG };
}

// Signed volume of closed triangle meshes (divergence theorem), in mm^3 when coordinates are mm.
export function meshVolume(geoms) {
  let v = 0;
  for (const g of geoms) {
    const P = g.attributes.position.array, I = g.index ? g.index.array : null, n = I ? I.length : P.length / 3;
    for (let t = 0; t < n; t += 3) {
      const a = (I ? I[t] : t) * 3, b = (I ? I[t + 1] : t + 1) * 3, c = (I ? I[t + 2] : t + 2) * 3;
      v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
  }
  return v;
}

// Hinge knuckle: a PLAIN tube (outer radius R, pin bore radius r), axis along z, no bevels or shaping.
// Built from parts so every face shades correctly: smooth outer wall, smooth inward-facing bore wall, and two flat
// ring end faces with exact +/-z normals. (An earlier bevelled extrusion triangulated the ends as long slivers and
// blended bevel normals into them, which shaded as a star pattern.)
export function knuckleGeometry(k) {
  // k: { R, r, LENGTH, SEG, SEAMS?: [z...], SEAM_W?, SEAM_D? }
  const seg = k.SEG || 64, L = k.LENGTH;
  // outer wall as a lathe profile so it can carry hinge-joint seams: narrow V-grooves at each SEAMS z position
  // (2026-10-06: seams line up with the carved channel edges, like the knuckle joints of a hinge)
  const prof = [new THREE.Vector2(k.R, -L / 2)];
  const w = (k.SEAM_W || 0.05) / 2, d = k.SEAM_D || 0.04;
  for (const z of [...(k.SEAMS || [])].sort((a, b) => a - b)) {
    prof.push(new THREE.Vector2(k.R, z - w), new THREE.Vector2(k.R - d, z), new THREE.Vector2(k.R, z + w));
  }
  prof.push(new THREE.Vector2(k.R, L / 2));
  const outer = toCreasedNormals(new THREE.LatheGeometry(prof, seg), Math.PI / 6);   // crisp groove edges, smooth around
  const bore = new THREE.CylinderGeometry(k.r, k.r, L, seg, 1, true);
  const ix = bore.index.array;                                   // flip the bore so its faces look into the hole
  for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
  const bn = bore.attributes.normal.array; for (let i = 0; i < bn.length; i++) bn[i] = -bn[i];
  outer.rotateX(Math.PI / 2); bore.rotateX(Math.PI / 2);          // axis y -> z (lathe and cylinder both spin about y)
  const capP = new THREE.RingGeometry(k.r, k.R, seg, 1); capP.translate(0, 0, L / 2);                    // faces +z
  const capN = new THREE.RingGeometry(k.r, k.R, seg, 1); capN.rotateY(Math.PI); capN.translate(0, 0, -L / 2); // faces -z
  return mergeGeometries([outer, bore.toNonIndexed(), capP.toNonIndexed(), capN.toNonIndexed()]);
}
