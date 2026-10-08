// KD-136 build step: precompute the disc triangulation (constrained Delaunay via cdt2d, ~2.5 s) into
// src/disc_topology.json, which the viewer loads (computing it on page load was too slow). Run before vite build.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildTopology, packTopology } from './src/topology.js';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const OL = JSON.parse(fs.readFileSync(here('./src/outline.json')));
const topo = buildTopology({ outer: OL.outer, hole: OL.hole, T: 1.5, RINGS: [0.02, 0.07, 0.15, 0.26, 0.4, 0.56, 0.72], GRID: 0.3 });
fs.writeFileSync(here('./src/disc_topology.json'), JSON.stringify(packTopology(topo)));
console.log(`KD-136 topology: ${topo.pts.length} points, ${topo.tris.length} triangles`);
