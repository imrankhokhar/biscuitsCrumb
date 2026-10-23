import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Express local: http://localhost:4000 (default)
// Cloudflare Worker local: http://127.0.0.1:8787  → set API_PROXY=http://127.0.0.1:8787
const apiTarget = process.env.API_PROXY || 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['biscuits.exodevs.com', '.exodevs.com', 'localhost'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})

