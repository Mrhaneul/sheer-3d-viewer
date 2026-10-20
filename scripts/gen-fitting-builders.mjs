// Fitting Room builders, generated from the product viewers (2026-10-20).
// For each product without a hand-written build.js, reads its main.js and writes build.gen.js next to it: the viewer's
// own Materials-to-assembly code, copied verbatim into `build(ctx)`, which returns the finished piece. main.js is never
// changed, so the viewer and the Fitting Room always share one source (the CAD numbers live in main.js only).
// Run before the Fitting Room build (npm run build does). Generated files are not committed (see .gitignore).
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PRODUCTS = [{ id: 'kd116', dir: 'src' }, ...fs.readdirSync(path.join(ROOT, 'products')).sort().map(id => ({ id, dir: `products/${id}/src` }))];
const VIEWER_ONLY = /OrbitControls|RoomEnvironment/;   // imports the builder does not need

const out = [];
for (const { id, dir } of PRODUCTS) {
  const src = path.join(ROOT, dir), main = path.join(src, 'main.js');
  if (fs.existsSync(path.join(src, 'build.js'))) { out.push(`${id}: hand-written build.js`); continue; }
  if (!fs.existsSync(main)) continue;
  const code = fs.readFileSync(main, 'utf8');
  const cut = (startMark, endMark, inclusive = true) => {
    const a = code.indexOf(startMark); if (a < 0) return null;
    const b = code.indexOf(endMark, a); if (b < 0) return null;
    return code.slice(a, inclusive ? b + endMark.length : b);
  };
  const imports = code.split('\n').filter(l => /^import /.test(l) && !VIEWER_ONLY.test(l));
  const gem = cut('// Separate environment for the stones', 'const gemEnv = pmrem.fromScene(gemEnvScene, 0.0).texture;');
  // the assembly ends where the viewer places the piece: jewel.rotation.set(...) or, in KD-136, scene.add(jewel)
  const body = cut('// ---------- Materials ----------', 'jewel.rotation.set(0, 0, 0);') || cut('// ---------- Materials ----------', 'scene.add(jewel);', false);
  if (!body) throw new Error(`${id}: could not find the Materials-to-assembly section in ${dir}/main.js`);
  const has = name => new RegExp(`\\b(const|let|function)\\s+${name}\\b`).test(body);
  const ret = ['jewel', 'METALS', 'bandMat', 'stones', 'stoneMat', 'stonePhysMat'].filter(has);
  const file = `// GENERATED from ${dir}/main.js by scripts/gen-fitting-builders.mjs. Do not edit: edit main.js.
${imports.join('\n')}

// build({ renderer }) -> { ${ret.join(', ')} }: the piece exactly as the product viewer builds it (mm, viewer frame).
export function build(ctx = {}) {
  const renderer = ctx.renderer;
  const scene = ctx.scene || new THREE.Scene(), camera = ctx.camera || new THREE.PerspectiveCamera();   // used only by the viewer's stone passes
  const reduceMotion = true;
  ${gem ? 'const pmrem = new THREE.PMREMGenerator(renderer);\n' + gem : ''}
${body}
  return { ${ret.join(', ')} };
}
`;
  fs.writeFileSync(path.join(src, 'build.gen.js'), file);
  out.push(`${id}: build.gen.js (${(file.length / 1024).toFixed(1)} KB; returns ${ret.join(', ')})`);
}
console.log(out.join('\n'));
