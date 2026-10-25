import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Preview-only overrides, gated on BASE44_PREVIEW_MODE === "1"; with the flag
// unset the server keeps plain local behaviour.
const isPreview = process.env.BASE44_PREVIEW_MODE === '1'
const sandboxHostDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    // The browser talks to the API through this dev server (single origin), so
    // sessions and the socket need no cross-site configuration.
    proxy: {
      '/api': { target: 'http://api:8000', changeOrigin: false },
      '/media': { target: 'http://api:8000', changeOrigin: false },
      '/ws': { target: 'ws://api:8000', ws: true, changeOrigin: false },
    },
    ...(isPreview && sandboxHostDomain
      ? {
          allowedHosts: [`.${sandboxHostDomain}`],
          watch: { usePolling: true },
        }
      : {}),
  },
})
