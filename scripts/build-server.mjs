import { build } from 'esbuild'
import { pathToFileURL } from 'url'

/**
 * Bundles the Node server (src/main) into dist/server/index.js.
 *
 * `packages: 'external'` keeps node_modules (ssh2, better-sqlite3, ws, adm-zip)
 * as runtime requires so native modules are not bundled.
 */
export const serverBuildOptions = {
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  await build(serverBuildOptions)
  console.log('[terminux] server bundled -> dist/server/index.js')
}

