# SHEER OBJECTS — 3D product viewers

Live: https://mrhaneul.github.io/sheer-3d-viewer/ (pick any product from the menu at the top of each page)

| Product | Page | Source |
|---|---|---|
| KD-115 · Pear pendant | `/kd115/` | `products/kd115/` |
| KD-116 · Pavé huggie earring | `/` (site root) | `index.html`, `src/` |
| KD-121 · Diamond line necklace | `/kd121/` | `products/kd121/` |
| KD-122 · Lariat necklace | `/kd122/` | `products/kd122/` |
| KD-133 · Thin hinged huggie | `/kd133/` | `products/kd133/` |
| KD-134 · Chunky huggie | `/kd134/` | `products/kd134/` |
| KD-135 · Organic loop pendant | `/kd135/` | `products/kd135/` |
| KD-136 · Organic disc pendant | `/kd136/` | `products/kd136/` |
| KD-137 · Domed huggie earring | `/kd137/` | `products/kd137/` |

## Build
`npm run build` builds KD-116 to `dist/` and each product to `dist/<id>/` (Vite, single-file pages, Three.js r186).
Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`, which runs `npm run build`).
KD-136's disc triangulation is generated during the build (`products/kd136/gen_topology.mjs`, cdt2d, ~2.5 s) into
`products/kd136/src/disc_topology.json`; it is not committed. Its outline is traced from the CAD front view (`src/outline.json`).

## Notes
- All geometry is procedural, built from the Karma CAD sheets. Every dimension in the code is labelled in a comment:
  `CAD` (printed), `CAD-MEASURED` (measured from the sheet), `WEIGHT-FIT`, `REF-FIT`, `ASSUMED`, or `DECIDED`.
- Open questions for Karma are recorded in each product's `main.js` comments.
- `src/MeshTransmissionMaterialImpl.js` is a vanilla port of drei's MeshTransmissionMaterial (MIT), shared by every product
  with deep-mode stones (KD-116, KD-115, KD-121, KD-122, KD-135).
