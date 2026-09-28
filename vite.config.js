import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ plugins: [viteSingleFile()], assetsInclude: ['**/*.hdr'], build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000 } });
