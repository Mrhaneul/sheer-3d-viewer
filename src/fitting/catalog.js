// Fitting Room catalogue (2026-10-20): every product with a shared builder in products/<id>/src/build.js. Each loads on
// demand and exports `info` (what the Fitting Room needs: kind, chain spec or piercing point) and a builder:
//   necklaces: buildPendant({ metal, stone }) -> the pendant without its chain (the Fitting Room drapes the chain with physics)
//   earrings:  build({ metal }) -> the earring, with info.pierce = where it goes through the ear
// All geometry is in millimetres, in the same frames as the product viewers. Products are added as they are split.
export const products = {
  kd115: () => import('../../products/kd115/src/build.js'),   // Pear pendant (necklace)
  kd134: () => import('../../products/kd134/src/build.js'),   // Chunky huggie (earring)
};
