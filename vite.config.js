import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Base44 sandbox preview runs this dev server behind a public proxy, which
// forwards the external hostname. Preview-only overrides apply when
// BASE44_PREVIEW_MODE is exactly "1"; unset (or any other value) keeps the
// plain local development behaviour.
const isPreview = process.env.BASE44_PREVIEW_MODE === '1'
const sandboxHostDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    ...(isPreview && sandboxHostDomain
      ? {
          // Accept the proxied host (<port>-<sandbox id>.<domain>) and poll,
          // because bind-mounted files do not always fire inotify events.
          allowedHosts: [`.${sandboxHostDomain}`],
          watch: { usePolling: true },
        }
      : {}),
  },
})
