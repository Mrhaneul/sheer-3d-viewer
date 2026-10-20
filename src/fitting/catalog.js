// Fitting Room catalogue (2026-10-20): every product, loaded on demand. Two kinds of builder:
//  - hand-written products/<id>/src/build.js (KD-115, KD-134): export `info` (kind, chain spec or piercing point) and
//    build({ metal }) / buildPendant({ metal, stone }).
//  - generated build.gen.js (every other product; scripts/gen-fitting-builders.mjs, run by npm run build): export
//    build({ renderer }) -> { jewel, METALS, bandMat, ... }, the piece exactly as its product viewer builds it.
// All geometry is in millimetres, in the same frames as the product viewers.
export const products = {
  kd115: () => import('../../products/kd115/src/build.js'),       // Pear pendant (necklace)
  kd116: () => import('../build.gen.js'),                         // Pavé huggie earring
  kd117: () => import('../../products/kd117/src/build.gen.js'),   // Solitaire stud
  kd118: () => import('../../products/kd118/src/build.gen.js'),   // Marquise stud
  kd119: () => import('../../products/kd119/src/build.gen.js'),   // Curved bar pendant (necklace)
  kd120: () => import('../../products/kd120/src/build.gen.js'),   // Threader earring
  kd121: () => import('../../products/kd121/src/build.gen.js'),   // Diamond line necklace
  kd122: () => import('../../products/kd122/src/build.gen.js'),   // Lariat necklace
  kd133: () => import('../../products/kd133/src/build.gen.js'),   // Thin hinged huggie
  kd134: () => import('../../products/kd134/src/build.js'),       // Chunky huggie (earring)
  kd135: () => import('../../products/kd135/src/build.gen.js'),   // Organic loop pendant (necklace)
  kd136: () => import('../../products/kd136/src/build.gen.js'),   // Organic disc pendant (necklace)
  kd137: () => import('../../products/kd137/src/build.gen.js'),   // Domed huggie earring
};
