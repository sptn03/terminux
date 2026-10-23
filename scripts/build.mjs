import { execSync } from 'child_process'

/** Full production build: browser SPA (dist/web) + Node server (dist/server). */
console.log('[terminux] building web UI...')
execSync('npx vite build', { stdio: 'inherit' })

console.log('[terminux] building server...')
execSync('node scripts/build-server.mjs', { stdio: 'inherit' })

console.log('[terminux] done. Start with: npm start')
