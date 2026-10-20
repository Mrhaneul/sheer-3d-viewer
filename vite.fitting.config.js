import { defineConfig } from 'vite';
// Fitting Room bundle (2026-10-20): the 13 product builders as ES modules for the Shopify theme's Fitting Room, served
// from GitHub Pages at fitting/catalog.js. Three.js stays external: the theme loads the same version (r186) through an
// import map, so the builders and the Fitting Room share one copy.
export default defineConfig({
  build: {
    target: 'es2022', outDir: 'dist/fitting', emptyOutDir: true,
    lib: { entry: 'src/fitting/catalog.js', formats: ['es'], fileName: () => 'catalog.js' },
    rollupOptions: { external: [/^three(\/.*)?$/] },
  },
});
