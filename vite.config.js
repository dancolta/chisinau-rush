import { defineConfig } from 'vite'

// Relative base so the static build works on GitHub Pages subpaths too.
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist' },
})
