/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the SPA and the Laravel API share one origin through this proxy,
// so Sanctum's cookie session and CSRF protection work exactly as in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = env.VITE_DEV_API_PROXY || 'http://localhost:8000'
  // The streaming relay (relay/), reached on the same origin so it works over https too.
  const relay = env.VITE_DEV_RELAY_PROXY || 'http://localhost:8090'
  // Reverb (live popups on the clean screen), same origin for the same reason.
  const reverb = env.VITE_DEV_REVERB_PROXY || 'http://127.0.0.1:8080'
  // `npm run dev:lan` (mode "lan") serves over HTTPS with a self-signed certificate:
  // browsers only allow the camera and microphone on https:// or http://localhost.
  const lan = mode === 'lan'

  return {
    plugins: [react(), tailwindcss(), ...(lan ? [basicSsl({ name: 'negosyowork-studio-dev' })] : [])],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: api, changeOrigin: false },
        '/sanctum': { target: api, changeOrigin: false },
        '/storage': { target: api, changeOrigin: false },
        '/relay': { target: relay, ws: true },
        // Pusher-protocol sockets: /app/{key}. Only that path (the SPA has no /app route).
        '^/app/': { target: reverb, ws: true },
      },
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
