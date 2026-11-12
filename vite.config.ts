// The browser app (src/app + each feature's ui/) builds to dist/app, which `readalong ui` serves.
// `pnpm dev` runs it with hot reload against a running `readalong ui`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/app', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': api, '/p/': api } },
});
