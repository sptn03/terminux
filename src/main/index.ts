import { createServer, IncomingMessage, ServerResponse } from 'http'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join, resolve } from 'path'
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'

import { initDatabase } from './db'
import { registerDbIpc } from './ipc/db.ipc'
import { registerSshIpc } from './ipc/ssh.ipc'
import { registerSftpIpc } from './ipc/sftp.ipc'
import { registerTunnelIpc } from './ipc/tunnel.ipc'
import { registerPortIpc } from './ipc/port.ipc'
import { registerLocalIpc } from './ipc/local.ipc'
import { registerAppIpc } from './ipc/app.ipc'
import { addBroadcastSink, invoke, send } from './ipc/ipc-bus'
import { assertInsideFsRoot, getDataDir, getTempDir } from './paths'
import { resolveDownloadPath } from './downloads'

const HOST = process.env['TERMINUX_HOST'] || '127.0.0.1'
const PORT = Number(process.env['TERMINUX_PORT'] || 3000)
const USER = process.env['TERMINUX_USER'] || 'admin'
const PASSWORD = process.env['TERMINUX_PASSWORD'] || ''
const WEB_DIR = resolve(process.env['TERMINUX_WEB_DIR'] || join(process.cwd(), 'dist/web'))

const MAX_JSON_BODY = 8 * 1024 * 1024
const MAX_UPLOAD_BODY = 1024 * 1024 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
}

// ---------------------------------------------------------------- auth -----

const AUTH_COOKIE = 'terminux_auth'

/** Deterministic cookie value derived from the credentials (no session store). */
function authToken(): string {
  return createHmac('sha256', PASSWORD || 'terminux-no-password').update(`${USER}:${PASSWORD}`).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function basicAuthOk(header: string | undefined): boolean {
  if (!header || !header.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8')
  const sep = decoded.indexOf(':')
  if (sep < 0) return false
  return safeEqual(decoded.slice(0, sep), USER) && safeEqual(decoded.slice(sep + 1), PASSWORD)
}

function cookieToken(req: IncomingMessage): string | null {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === AUTH_COOKIE) return rest.join('=')
  }
  return null
}

/** True when the request is allowed to reach the API. */
function isAuthorized(req: IncomingMessage): boolean {
  if (!PASSWORD) return true
  if (basicAuthOk(req.headers.authorization)) return true
  const token = cookieToken(req)
  return !!token && safeEqual(token, authToken())
}

// ------------------------------------------------------------- helpers -----

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  // BigInt (better-sqlite3 rowids) is not JSON serializable
  const body = JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Dữ liệu gửi lên quá lớn'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function streamFile(res: ServerResponse, filePath: string, downloadName?: string): void {
  const stat = statSync(filePath)
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(stat.size)
  }
  if (downloadName) {
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(downloadName)}"`
  }
  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
}

function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): void {
  if (!existsSync(WEB_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Chưa có bản build giao diện. Chạy "npm run build" trước.')
    return
  }

  const relative = decodeURIComponent(urlPath).replace(/^\/+/, '')
  const candidate = resolve(join(WEB_DIR, relative))
  const insideWebDir = candidate === WEB_DIR || candidate.startsWith(WEB_DIR + '/')

  if (insideWebDir && relative && existsSync(candidate) && statSync(candidate).isFile()) {
    streamFile(res, candidate)
    return
  }

  // SPA fallback
  streamFile(res, join(WEB_DIR, 'index.html'))
}

// ------------------------------------------------------------- routing -----

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!isAuthorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Terminux"', 'Content-Type': 'text/plain' })
    res.end('Unauthorized')
    return
  }

  switch (url.pathname) {
    case '/api/invoke': {
      const { channel, args } = JSON.parse((await readBody(req, MAX_JSON_BODY)).toString('utf-8') || '{}')
      try {
        sendJson(res, 200, { ok: true, result: await invoke(channel, args || []) })
      } catch (err: any) {
        sendJson(res, 200, { ok: false, error: err?.message || String(err) })
      }
      return
    }

    case '/api/send': {
      const { channel, args } = JSON.parse((await readBody(req, MAX_JSON_BODY)).toString('utf-8') || '{}')
      send(channel, args || [])
      sendJson(res, 200, { ok: true })
      return
    }

    case '/api/upload': {
      const name = basename(url.searchParams.get('name') || `upload-${Date.now()}`)
      const body = await readBody(req, MAX_UPLOAD_BODY)
      const dir = join(getTempDir(), `up-${randomBytes(6).toString('hex')}`)
      mkdirSync(dir, { recursive: true })
      const target = join(dir, name)
      writeFileSync(target, body)
      sendJson(res, 200, { ok: true, path: target, name, size: body.length })
      return
    }

    case '/api/download': {
      const filePath = resolveDownloadPath(url.searchParams.get('file') || '')
      if (!filePath) {
        sendJson(res, 404, { ok: false, error: 'Không tìm thấy tệp' })
        return
      }
      streamFile(res, filePath, basename(filePath))
      return
    }

    // Serves any file inside the allowed filesystem root (background images,
    // previews of files that live on the machine running the server).
    case '/api/file': {
      const requested = url.searchParams.get('path') || ''
      try {
        const safePath = assertInsideFsRoot(requested)
        if (!existsSync(safePath) || !statSync(safePath).isFile()) {
          sendJson(res, 404, { ok: false, error: 'Không tìm thấy tệp' })
          return
        }
        streamFile(res, safePath)
      } catch (err: any) {
        sendJson(res, 403, { ok: false, error: err.message })
      }
      return
    }

    default:
      sendJson(res, 404, { ok: false, error: 'Không tìm thấy API' })
  }
}

// ------------------------------------------------------------- bootstrap ---

function main(): void {
  getDataDir()
  initDatabase()

  registerDbIpc()
  registerSshIpc()
  registerSftpIpc()
  registerTunnelIpc()
  registerPortIpc()
  registerLocalIpc()
  registerAppIpc()

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((err: any) => {
        sendJson(res, 500, { ok: false, error: err?.message || 'Lỗi máy chủ' })
      })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }

    if (!isAuthorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Terminux"', 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Unauthorized')
      return
    }

    // Remember the credentials so the WebSocket upgrade can be authenticated too.
    if (PASSWORD) {
      res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${authToken()}; Path=/; HttpOnly; SameSite=Strict`)
    }

    serveStatic(req, res, url.pathname)
  })

  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (socket: WebSocket) => {
    const removeSink = addBroadcastSink((channel, args) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'event', channel, args }))
      }
    })

    socket.on('message', async (raw) => {
      let message: any
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (message?.type === 'send') {
        send(message.channel, message.args || [])
        return
      }

      if (message?.type === 'invoke') {
        try {
          const result = await invoke(message.channel, message.args || [])
          socket.send(JSON.stringify({ type: 'result', id: message.id, result }))
        } catch (err: any) {
          socket.send(JSON.stringify({ type: 'error', id: message.id, error: err?.message || String(err) }))
        }
      }
    })

    socket.on('close', removeSink)
  })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== '/api/events' || !isAuthorized(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  server.listen(PORT, HOST, () => {
    console.log(`[terminux] server  http://${HOST}:${PORT}`)
    console.log(`[terminux] data    ${getDataDir()}`)
    console.log(`[terminux] webroot ${WEB_DIR}`)
    if (!PASSWORD) {
      console.warn('[terminux] CẢNH BÁO: chưa đặt TERMINUX_PASSWORD — bất kỳ ai truy cập được cổng này đều có toàn quyền SSH.')
    }
  })
}

main()

