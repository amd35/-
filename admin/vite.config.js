import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isPreview = process.env.BASE44_PREVIEW_MODE === '1'
const sandboxHostDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3001,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://api:8000', changeOrigin: false },
      '/media': { target: 'http://api:8000', changeOrigin: false },
    },
    ...(isPreview && sandboxHostDomain
      ? {
          allowedHosts: [`.${sandboxHostDomain}`],
          watch: { usePolling: true },
        }
      : {}),
  },
})
