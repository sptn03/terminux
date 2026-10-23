import { spawn } from 'child_process'
import { context } from 'esbuild'
import { serverBuildOptions } from './build-server.mjs'

/**
 * Development mode:
 *   - Vite dev server (HMR) on http://localhost:5173
 *   - Node server with auto-restart on http://127.0.0.1:3000
 * Open http://localhost:5173 in the browser.
 */
const children = []

function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options })
  children.push(child)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[terminux] "${command} ${args.join(' ')}" thoát với mã ${code}`)
    }
  })
  return child
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch { /* already gone */ }
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const ctx = await context({ ...serverBuildOptions, sourcemap: 'inline' })
await ctx.watch()
console.log('[terminux] watching server sources (esbuild)')

run(process.execPath, ['--watch', 'dist/server/index.js'])
run(process.execPath, ['node_modules/vite/bin/vite.js'])

console.log('[terminux] web UI  http://localhost:5173')
console.log('[terminux] api/ws  http://127.0.0.1:3000')
