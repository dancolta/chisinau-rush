import { defineConfig } from 'vite'

// `npm run dev` / `npm run preview`: /api goes to the local API server (npm run api, tools/api-dev.mjs)
const api = { '/api': { target: process.env.API_DEV_URL || 'http://127.0.0.1:8787' } }

// Relative base so the static build works on GitHub Pages subpaths too.
// Engine libraries go in their own chunks so they download in parallel and stay cached between game updates.
export default defineConfig({
  base: './',
  server: { proxy: api },
  preview: { proxy: api },
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          physics: ['@dimforge/rapier3d-compat'],
          post: ['postprocessing', 'n8ao'],
        },
      },
    },
  },
})
