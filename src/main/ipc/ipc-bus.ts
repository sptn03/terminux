/**
 * Transport-agnostic replacement for Electron's `ipcMain` / `webContents.send`.
 *
 * The HTTP + WebSocket server (src/main/index.ts) dispatches client requests
 * into the handlers registered here, and forwards `broadcast()` calls to every
 * connected browser through the event WebSocket.
 *
 * Keeping the `ipcMain.handle(channel, handler)` shape means the existing
 * ipc/*.ts handler modules stay untouched apart from their import line.
 */

type Handler = (event: unknown, ...args: any[]) => any
type Listener = (...args: any[]) => void

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Set<Listener>>()
const broadcastSinks = new Set<(channel: string, args: any[]) => void>()

export const ipcMain = {
  handle(channel: string, handler: Handler): void {
    handlers.set(channel, handler)
  },
  on(channel: string, listener: Listener): void {
    let set = listeners.get(channel)
    if (!set) {
      set = new Set()
      listeners.set(channel, set)
    }
    set.add(listener)
  }
}

export function hasHandler(channel: string): boolean {
  return handlers.has(channel)
}

/** Request/response call — equivalent to ipcRenderer.invoke. */
export async function invoke(channel: string, args: any[] = []): Promise<any> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Không có handler cho kênh "${channel}"`)
  return await handler(null, ...args)
}

/** Fire-and-forget call — equivalent to ipcRenderer.send.
 *
 * Listeners follow Electron's signature, i.e. they receive the (unused) event
 * object as their first argument.
 */
export function send(channel: string, args: any[] = []): void {
  const set = listeners.get(channel)
  if (!set) return
  for (const listener of set) {
    try {
      listener(null, ...args)
    } catch (err: any) {
      console.error(`[terminux] listener lỗi trên kênh "${channel}":`, err.message)
    }
  }
}

/** Server → client push — equivalent to webContents.send. */
export function broadcast(channel: string, ...args: any[]): void {
  for (const sink of broadcastSinks) {
    try {
      sink(channel, args)
    } catch { /* client gone */ }
  }
}

export function addBroadcastSink(sink: (channel: string, args: any[]) => void): () => void {
  broadcastSinks.add(sink)
  return () => broadcastSinks.delete(sink)
}
