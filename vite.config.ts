import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

/**
 * Renderer (browser SPA) build.
 *
 * The server (src/main) is bundled separately by scripts/build-server.mjs.
 * In dev, Vite serves the SPA on :5173 and proxies the API + WebSocket to the
 * Node server on :3000.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer')
    }
  },
  css: {
    // The PostCSS/Tailwind configs live at the project root, outside `root`.
    postcss: {
      plugins: [
        tailwindcss({ config: resolve('tailwind.config.js') }),
        autoprefixer()
      ]
    }
  },
  build: {
    outDir: resolve('dist/web'),
    emptyOutDir: true,
    target: 'es2022'
  },
  server: {
    port: 5173,
    proxy: {
      '/api/invoke': 'http://127.0.0.1:3000',
      '/api/send': 'http://127.0.0.1:3000',
      '/api/upload': 'http://127.0.0.1:3000',
      '/api/download': 'http://127.0.0.1:3000',
      '/api/file': 'http://127.0.0.1:3000',
      '/api/events': { target: 'ws://127.0.0.1:3000', ws: true }
    }
  }
})
