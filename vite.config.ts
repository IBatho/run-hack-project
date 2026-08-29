import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Regex key so the frontend's own /api.ts module is not proxied.
      '^/api/': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
