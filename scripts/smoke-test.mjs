/**
 * Terminux smoke test — no test framework required.
 *
 *   node scripts/smoke-test.mjs      (or: npm test)
 *
 * Boots the real server (dist/server/index.js) on a free port with a throwaway
 * data directory, then verifies:
 *   A. HTTP/WebSocket API: encryption, upload/download, filesystem jail
 *   B. Full SSH flow against a fake in-process SSH server
 *   C. Basic auth (page, API, WebSocket upgrade)
 */
import { spawn } from 'child_process'
import { createServer } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ssh2 from 'ssh2'
import WebSocket from 'ws'

const { Server: SshServer, utils } = ssh2

const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

function freePort() {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function startServer(env) {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', (data) => console.error('[server]', data.toString().trim()))
  return child
}

async function waitForServer(baseUrl, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(baseUrl, { headers: { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64') } })
      if (res.status < 500) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not start in time')
}

// ---------------------------------------------------------------------------
// Fake SSH server used by part B
// ---------------------------------------------------------------------------
function startFakeSsh(port) {
  const { private: hostKey } = utils.generateKeyPairSync('ed25519')
  const server = new SshServer({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'pw') ctx.accept()
      else if (ctx.method === 'none') ctx.reject(['password'])
      else ctx.reject()
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (acceptPty) => acceptPty && acceptPty())
        session.on('window-change', () => {})
        session.on('shell', (acceptShell) => {
          const stream = acceptShell()
          stream.write('welcome-to-fake-ssh\r\n')
          stream.on('data', (chunk) => stream.write('echo:' + chunk.toString()))
        })
        session.on('exec', (acceptExec) => {
          const stream = acceptExec()
          stream.write('ss-output\n')
          stream.exit(0)
          stream.end()
        })
      })
    })
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const dataDir = mkdtempSync(join(tmpdir(), 'terminux-test-'))
const authDir = mkdtempSync(join(tmpdir(), 'terminux-auth-'))
const port = await freePort()
const authPort = await freePort()
const sshPort = await freePort()

const base = `http://127.0.0.1:${port}`
const authBase = `http://127.0.0.1:${authPort}`
const authHeader = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64') }

let server
let authServer
let fakeSsh

const invoke = async (channel, args = [], target = base, headers = {}) => {
  const res = await fetch(`${target}/api/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ channel, args })
  })
  return (await res.json()).result
}

const waitForEvent = (events, predicate, timeout = 8000) => new Promise((resolve) => {
  const started = Date.now()
  const poll = () => {
    const found = events.find(predicate)
    if (found) return resolve(found)
    if (Date.now() - started > timeout) return resolve(null)
    setTimeout(poll, 100)
  }
  poll()
})

try {
  server = startServer({ TERMINUX_DATA_DIR: dataDir, TERMINUX_PORT: String(port) })
  await waitForServer(base)
  check('server starts and serves the SPA', true, base)

  // ------------------------------------------------------------- A. API ----
  const secret = 'p@ssw0rd-có-dấu-#1'
  const encrypted = await invoke('app:encryptPassword', [secret])
  check('password encrypted at rest', encrypted !== secret && encrypted.length > 20)
  check('password decrypts back', (await invoke('app:decryptPassword', [encrypted])) === secret)
  check('plaintext passes through decrypt', (await invoke('app:decryptPassword', ['plain'])) === 'plain')

  const upload = await fetch(`${base}/api/upload?name=hello.txt`, { method: 'POST', body: 'xin chao' })
  const uploaded = await upload.json()
  check('POST /api/upload stores the file', uploaded.ok === true, uploaded.path)
  const served = await fetch(`${base}/api/file?path=${encodeURIComponent(uploaded.path)}`)
  check('GET /api/file serves it back', (await served.text()) === 'xin chao')

  check('db:all query works', Array.isArray(await invoke('db:all', ['SELECT * FROM hosts', []])))
  check('app:listThemes returns builtin themes', (await invoke('app:listThemes', [])).length > 0)
  check('local:listDir lists the server filesystem', Array.isArray(await invoke('local:listDir', ['/tmp'])))
  check('local:getDrives returns a root', (await invoke('local:getDrives', [])).length > 0)
  check('sftp on unknown session returns an error payload', !!(await invoke('sftp:listDir', ['nope', '/'])).error)
  check('tunnel:list responds', Array.isArray(await invoke('tunnel:list', [])))
  check('history:list responds', Array.isArray(await invoke('history:list', [])))

  // WebSocket push (a failed SSH connect broadcasts shell:error)
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/events`)
  const events = []
  socket.on('message', (raw) => events.push(JSON.parse(raw.toString())))
  await new Promise((resolve, reject) => {
    socket.on('open', resolve)
    socket.on('error', reject)
  })
  check('websocket /api/events connects', true)

  const failedConnect = await invoke('ssh:connect', [{ host: '127.0.0.1', port: 1, username: 'x', authMethod: 'password', password: 'y' }])
  check('ssh:connect to a dead port reports an error', !!failedConnect.error)
  check('shell:error is pushed to the browser', !!(await waitForEvent(events, (e) => e.channel === 'shell:error')))

  // -------------------------------------------------------- B. SSH flow ----
  fakeSsh = await startFakeSsh(sshPort)

  const connection = await invoke('ssh:connect', [{
    host: '127.0.0.1', port: sshPort, username: 'tester', authMethod: 'password', password: 'pw'
  }])
  const sessionId = connection?.sessionId
  check('ssh:connect succeeds against a real ssh server', !!sessionId && !connection.error, sessionId || connection.error)
  check('shell banner is streamed over websocket',
    !!(await waitForEvent(events, (e) => e.channel === 'shell:output' && e.args[0] === sessionId && e.args[1].includes('welcome-to-fake-ssh'))))

  await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'ssh:shell-input', args: [sessionId, 'ls -la\n'] })
  })
  check('keystrokes reach the remote shell',
    !!(await waitForEvent(events, (e) => e.channel === 'shell:output' && e.args[1].includes('echo:ls -la'))))

  await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'ssh:shell-resize', args: [sessionId, 100, 40] })
  })

  const exec = await invoke('ssh:exec', [sessionId, 'uname -a'])
  check('ssh:exec returns stdout', !!exec?.stdout?.includes('ss-output'))

  const history = await invoke('history:list', [])
  check('session history row recorded', history.some((row) => row.id === sessionId))
  const logText = await invoke('history:readLog', [sessionId])
  check('terminal session log written to disk', typeof logText === 'string' && logText.includes('welcome-to-fake-ssh'))

  await invoke('ssh:disconnect', [sessionId])
  check('shell:exit is pushed on disconnect', !!(await waitForEvent(events, (e) => e.channel === 'shell:exit' && e.args[0] === sessionId)))

  socket.close()

  // ----------------------------------------------------------- C. auth -----
  authServer = startServer({
    TERMINUX_DATA_DIR: authDir,
    TERMINUX_PORT: String(authPort),
    TERMINUX_PASSWORD: 'secret',
    TERMINUX_FS_ROOT: authDir
  })
  await waitForServer(authBase)

  check('page requires auth', (await fetch(`${authBase}/`)).status === 401)
  check('api requires auth', (await fetch(`${authBase}/api/invoke`, { method: 'POST', body: '{}' })).status === 401)
  check('page works with credentials', (await fetch(`${authBase}/`, { headers: authHeader })).status === 200)
  check('api works with credentials', Array.isArray(await invoke('history:list', [], authBase, authHeader)))
  check('filesystem jail blocks /etc/passwd', (await fetch(`${authBase}/api/file?path=/etc/passwd`, { headers: authHeader })).status === 403)
  check('filesystem jail blocks writes outside the root',
    !!(await invoke('local:mkdir', ['/tmp/terminux-jail-escape'], authBase, authHeader)).error)

  const unauthSocket = new WebSocket(`ws://127.0.0.1:${authPort}/api/events`)
  const rejected = await new Promise((resolve) => {
    unauthSocket.on('open', () => resolve(false))
    unauthSocket.on('unexpected-response', (_req, res) => resolve(res.statusCode === 401))
    unauthSocket.on('error', () => resolve(true))
  })
  check('unauthenticated websocket upgrade rejected', rejected)

  const authSocket = new WebSocket(`ws://127.0.0.1:${authPort}/api/events`, { headers: authHeader })
  const accepted = await new Promise((resolve) => {
    authSocket.on('open', () => resolve(true))
    authSocket.on('error', () => resolve(false))
    authSocket.on('unexpected-response', () => resolve(false))
  })
  check('authenticated websocket upgrade accepted', accepted)
  authSocket.close()
} catch (err) {
  check(`unexpected failure: ${err.message}`, false)
} finally {
  server?.kill('SIGTERM')
  authServer?.kill('SIGTERM')
  fakeSsh?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(authDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
