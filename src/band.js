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
