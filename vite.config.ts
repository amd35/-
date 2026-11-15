import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The preview proxy forwards a sandbox host (Host header) and the public origin.
// Vite appends __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS itself; in preview mode we
// also allow every subdomain of the sandbox host domain so a rotated sandbox id
// keeps working.
const previewHosts =
  process.env.BASE44_PREVIEW_MODE === '1' && process.env.BASE44_SANDBOX_HOST_DOMAIN
    ? [`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`]
    : []

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: previewHosts,
    watch: { usePolling: true, interval: 300 },
  },
})
