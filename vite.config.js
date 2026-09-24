import { defineConfig } from 'vite'

// Relative base so the static build works on GitHub Pages subpaths too.
// Engine libraries go in their own chunks so they download in parallel and stay cached between game updates.
export default defineConfig({
  base: './',
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
