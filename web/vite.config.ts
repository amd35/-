import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_URL || 'http://api:4000';
const wsTarget = process.env.API_WS_URL || 'ws://api:4000';
const isPreview = process.env.BASE44_PREVIEW_MODE === '1';

const allowedHosts = [
  'localhost',
  '127.0.0.1',
  'web',
  ...(isPreview
    ? [
        `.${process.env.BASE44_SANDBOX_HOST_DOMAIN || 'e2b.app'}`,
        ...(process.env.BASE44_PUBLIC_HOST_SUFFIX
          ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
          : []),
      ]
    : []),
];

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts,
    watch: { usePolling: true, interval: 400 },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true },
      '/ws': { target: wsTarget, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
