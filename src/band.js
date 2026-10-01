import * as THREE from 'three';

// KD-116 band as ONE continuous sweep of a rounded profile (no flat extruded slab), with a round cup
// pressed into the top for each stone and 4 diagonal claw prongs per stone (annotated refs 2026-10-01).
// Pure geometry: no renderer/DOM, so it can be checked headlessly in Node.

function roundedRectLoop(hu, hv, rc, n) {
  // perimeter of a rounded rectangle in (u = radial, v = axial), CCW, ~uniform by arc length
  const segs = [];
  const line = (u0, v0, u1, v1) => segs.push({ len: Math.hypot(u1 - u0, v1 - v0), at: t => [u0 + (u1 - u0) * t, v0 + (v1 - v0) * t] });
  const arc = (cu, cv, a0) => segs.push({ len: rc * Math.PI / 2, at: t => { const a = a0 + t * Math.PI / 2; return [cu + rc * Math.cos(a), cv + rc * Math.sin(a)]; } });
  const U = hu - rc, V = hv - rc;
  line(hu, -V, hu, V);   arc(U, V, 0);
  line(U, hv, -U, hv);   arc(-U, V, Math.PI / 2);
  line(-hu, V, -hu, -V); arc(-U, -V, Math.PI);
  line(-U, -hv, U, -hv); arc(U, -V, 1.5 * Math.PI);
  const total = segs.reduce((s, g) => s + g.len, 0), pts = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    for (const g of segs) { if (d <= g.len) { pts.push(g.at(d / g.len)); break; } d -= g.len; }
  }
  return pts;
}

export function buildBand(c) {
  // c: { R_MID, THICK, WIDTH, CORNER, A_START, A_END, stoneAngles, PITCH, SEAT_R, SEAT_C, PROFILE_N, DENSE_STEP, COARSE_STEP }
  const prof = roundedRectLoop(c.THICK / 2, c.WIDTH / 2, c.CORNER, c.PROFILE_N);
  const paveEnd = c.stoneAngles[c.stoneAngles.length - 1] + c.PITCH * 0.75;
  const thetas = [];
  for (let t = c.A_START; t < c.A_END; ) { thetas.push(t); t += (t < paveEnd ? c.DENSE_STEP : c.COARSE_STEP); }
  thetas.push(c.A_END);

  const N = prof.length, M = thetas.length;
  const pos = new Float32Array(M * N * 3);
  const P = new THREE.Vector3();
  for (let j = 0; j < M; j++) {
    const th = thetas[j], ct = Math.cos(th), st = Math.sin(th);
    for (let i = 0; i < N; i++) {
      const [u, v] = prof[i], r = c.R_MID + u;
      P.set(r * ct, r * st, v);
      // round cup seat: vertical (radial) projection onto the lower cap of a sphere of radius SEAT_R
      for (const a of c.stoneAngles) {
        const ea = [Math.cos(a), Math.sin(a)];
        const s = P.x * ea[0] + P.y * ea[1];
        if (s <= 0) continue;
        const perp = P.x * ea[1] - P.y * ea[0];
        const w2 = perp * perp + P.z * P.z;
        if (w2 >= c.SEAT_R * c.SEAT_R) continue;
        const sFloor = c.SEAT_C - Math.sqrt(c.SEAT_R * c.SEAT_R - w2);
        if (s > sFloor) { P.x += (sFloor - s) * ea[0]; P.y += (sFloor - s) * ea[1]; }
      }
      pos.set([P.x, P.y, P.z], (j * N + i) * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + (i + 1) % N, cc = (j + 1) * N + i, d = (j + 1) * N + (i + 1) % N;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  // flat end caps (hinge and clasp ends), separate vertices so they shade flat
  const caps = [];
  [[0, -1], [M - 1, 1]].forEach(([j, dir]) => {
    const cx = [0, 0, 0];
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) cx[k] += pos[(j * N + i) * 3 + k] / N;
    for (let i = 0; i < N; i++) {
      const p0 = pos.slice((j * N + i) * 3, (j * N + i) * 3 + 3), p1 = pos.slice((j * N + (i + 1) % N) * 3, (j * N + (i + 1) % N) * 3 + 3);
      if (dir > 0) caps.push(...cx, ...p0, ...p1); else caps.push(...cx, ...p1, ...p0);
    }
  });
  const capG = new THREE.BufferGeometry();
  capG.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  capG.computeVertexNormals();
  return { band: g, caps: capG };
}

// 4 prongs per stone on its diagonals: base on the cup rim, tip leaning over the crown edge.
export function prongSegments(stoneAngles, p) {
  // p: { BASE_R, BASE_OFF, TIP_R, TIP_OFF }
  const out = [];
  for (const a of stoneAngles) {
    const er = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), et = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0), ez = new THREE.Vector3(0, 0, 1);
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const d = et.clone().multiplyScalar(s1).add(ez.clone().multiplyScalar(s2)).normalize();
      out.push({
        base: er.clone().multiplyScalar(p.BASE_R).add(d.clone().multiplyScalar(p.BASE_OFF)),
        tip: er.clone().multiplyScalar(p.TIP_R).add(d.clone().multiplyScalar(p.TIP_OFF)),
      });
    }
  }
  return out;
}

// "Molar" holders (ref 2026-10-01): at every gap between stones, on each side of the band, ONE wide
// flat-sided tooth with two rounded cusps on top; each cusp grips one of the two neighbouring stones.
// Silhouette in (t = tangential, h = radial) extruded across a thin axial thickness with rounded bevels.
export function molarGeometry(m) {
  // m: { HALF_W, H_SIDE, H_CUSP, H_NOTCH, CUSP_T, THICK, BEVEL }
  const s = new THREE.Shape();
  const W = m.HALF_W, b = m.BEVEL;
  s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, m.H_SIDE);
  s.quadraticCurveTo(W, m.H_CUSP, m.CUSP_T, m.H_CUSP);                 // right cusp crown
  s.quadraticCurveTo(m.CUSP_T * 0.35, m.H_CUSP, 0, m.H_NOTCH);           // into the notch
  s.quadraticCurveTo(-m.CUSP_T * 0.35, m.H_CUSP, -m.CUSP_T, m.H_CUSP);   // out of the notch
  s.quadraticCurveTo(-W, m.H_CUSP, -W, m.H_SIDE);                        // left cusp crown
  s.lineTo(-W, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: m.THICK - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: 4, curveSegments: 14, steps: 1,
  });
  g.translate(0, 0, -(m.THICK - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

// One matrix per tooth: at each gap (including one beyond each end stone), both band sides.
export function molarMatrices(stoneAngles, pitch, p) {
  // p: { BASE_R, Z, LEAN }
  const out = [], gaps = [];
  for (let i = 0; i <= stoneAngles.length; i++) gaps.push(stoneAngles[0] + pitch * (i - 0.5));
  for (const g of gaps) {
    const er = new THREE.Vector3(Math.cos(g), Math.sin(g), 0), et = new THREE.Vector3(-Math.sin(g), Math.cos(g), 0), ez = new THREE.Vector3(0, 0, 1);
    for (const side of [-1, 1]) {
      const basis = new THREE.Matrix4().makeBasis(et, er, ez);
      const lean = new THREE.Matrix4().makeRotationX(-side * p.LEAN);  // tilt cusps slightly IN over the stones (toward z = 0)
      const pos = er.clone().multiplyScalar(p.BASE_R).add(ez.clone().multiplyScalar(side * p.Z));
      out.push(new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(basis).multiply(lean));
    }
  }
  return out;
}

// End teeth (ref 2026-10-01): beyond the first and last stone there is ONE single-cusp tooth per side,
// hugging that stone, instead of a two-cusp molar.
export function endToothGeometry(m) {
  // m: { HALF_W, H_SIDE, H_TOP, THICK, BEVEL }
  const s = new THREE.Shape(), W = m.HALF_W, b = m.BEVEL;
  s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, m.H_SIDE);
  s.quadraticCurveTo(W, m.H_TOP, 0, m.H_TOP);       // single rounded crown
  s.quadraticCurveTo(-W, m.H_TOP, -W, m.H_SIDE);
  s.lineTo(-W, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: m.THICK - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: 4, curveSegments: 14, steps: 1,
  });
  g.translate(0, 0, -(m.THICK - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

function toothMatrix(ang, side, p) {
  const er = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), et = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0), ez = new THREE.Vector3(0, 0, 1);
  const basis = new THREE.Matrix4().makeBasis(et, er, ez);
  const lean = new THREE.Matrix4().makeRotationX(-side * p.LEAN);
  const pos = er.clone().multiplyScalar(p.BASE_R).add(ez.clone().multiplyScalar(side * p.Z));
  return new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(basis).multiply(lean);
}

// Full setting layout: molars at the interior gaps only, single end teeth just outside the end stones.
export function settingLayout(stoneAngles, pitch, p) {
  // p: { BASE_R, Z, LEAN, END_OFF (tangential mm from end-stone centre to end tooth), R_TOOTH (radius used for mm→rad) }
  const molars = [], ends = [];
  for (let i = 1; i < stoneAngles.length; i++) {
    const g = stoneAngles[0] + pitch * (i - 0.5);
    for (const side of [-1, 1]) molars.push(toothMatrix(g, side, p));
  }
  const dEnd = p.END_OFF / p.R_TOOTH;
  for (const ang of [stoneAngles[0] - dEnd, stoneAngles[stoneAngles.length - 1] + dEnd])
    for (const side of [-1, 1]) ends.push(toothMatrix(ang, side, p));
  return { molars, ends };
}

// Rounded rails along each side joining tooth to tooth: a U that dips under each stone and cradles it.
export function railGeometries(stoneAngles, pitch, r) {
  // r: { Z, R_END, R_MID, TUBE, INSET_MM, R_REF }
  const out = [], h = pitch / 2 - r.INSET_MM / r.R_REF;
  for (const a of stoneAngles) for (const side of [-1, 1]) {
    const pts = [];
    for (let k = -4; k <= 4; k++) {
      const f = k / 4, th = a + f * h, rad = r.R_MID + (r.R_END - r.R_MID) * f * f;
      pts.push(new THREE.Vector3(rad * Math.cos(th), rad * Math.sin(th), side * r.Z));
    }
    out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r.TUBE, 12, false));
  }
  return out;
}

// ONE-PIECE setting wall per band side (2026-10-01): replaces separate molar teeth + U rails, whose overlaps
// showed seams. A single outline in the hoop plane: the top edge dips in a U under each stone and rises into
// two-cusp teeth between stones (single cusp at each end), blended with a smooth max so every junction is a
// fillet; then extruded once across a thin axial thickness, rounded by a bevel, and sheared to lean inward.
export function settingWalls(stoneAngles, pitch, p) {
  // p: { R_REF, U_MID, U_END, CUSP_PEAK, CUSP_W, CUSP_DROP, CUSP_POW, CUSP_T, END_OFF, R_BOT, Z, THICK, BEVEL, LEAN, BLEND, N }
  const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
  const half = pitch / 2;
  const cusps = [];   // tangential cusp centres, in angle
  for (let i = 1; i < stoneAngles.length; i++) {
    const g = stoneAngles[0] + pitch * (i - 0.5), dc = p.CUSP_T / p.R_REF;
    cusps.push(g - dc, g + dc);
  }
  const e0 = stoneAngles[0] - p.END_OFF / p.R_REF, e1 = stoneAngles[stoneAngles.length - 1] + p.END_OFF / p.R_REF;
  cusps.push(e0, e1);
  const top = th => {
    let r = p.R_BOT;
    for (const a of stoneAngles) {                       // U cradle under each stone
      const f = (th - a) / half;
      if (Math.abs(f) <= 1.25) r = Math.max(r, p.U_MID + (p.U_END - p.U_MID) * f * f);
    }
    r = Math.min(r, p.U_END);
    for (const c of cusps) {                             // rounded cusps, fillet-blended into the U
      const t = (th - c) * p.R_REF / p.CUSP_W;
      r = smax(r, p.CUSP_PEAK - p.CUSP_DROP * Math.pow(Math.abs(t), p.CUSP_POW || 2), p.BLEND);   // POW 4 = flat-topped rounded block
    }
    return r;
  };
  const ws = p.CUSP_W * 0.9 / p.R_REF, th0 = e0 - ws, th1 = e1 + ws;
  const pts = [];
  for (let k = 0; k <= p.N; k++) { const th = th0 + (th1 - th0) * k / p.N, r = top(th); pts.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th))); }
  for (let k = 40; k >= 0; k--) { const th = th0 + (th1 - th0) * k / 40; pts.push(new THREE.Vector2(p.R_BOT * Math.cos(th), p.R_BOT * Math.sin(th))); }
  const out = [];
  for (const side of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: p.THICK - 2 * p.BEVEL, bevelEnabled: true, bevelThickness: p.BEVEL, bevelSize: p.BEVEL,
      bevelOffset: -p.BEVEL, bevelSegments: 5, curveSegments: 4, steps: 1,
    });
    g.translate(0, 0, side * p.Z - (p.THICK - 2 * p.BEVEL) / 2);
    const pos = g.attributes.position;                   // shear: lean the top edge inward over the stones
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i)), h = Math.max(0, r - (p.R_BOT + 0.3));
      pos.setZ(i, pos.getZ(i) - side * p.LEAN * h);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}
