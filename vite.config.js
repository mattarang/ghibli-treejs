import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// two pages: the full workbench (index.html) and the demo (demo.html)
export default defineConfig({
  base: './',                                                            // relative: the built site works under any path (GitHub Pages serves it at /ghibli-treejs/)
  build: { target: 'es2022', rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), demo: resolve(import.meta.dirname, 'demo.html') } } },
})
