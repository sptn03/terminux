import { useState, useEffect, useCallback } from 'react'
import { Database, Square, ArrowRight, X } from 'lucide-react'

interface DbInstance {
  type: 'mysql' | 'postgres' | 'redis' | 'mongodb' | 'unknown'
  port: string
  address: string
  processName: string
  pid: string
}

interface ActiveTunnel {
  id: string
  listenPort: number
  targetPort: number
  active: boolean
}

interface DatabasePanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function DatabasePanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: DatabasePanelProps) {
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([])
  const [activeTunnels, setActiveTunnels] = useState<ActiveTunnel[]>([])
  const [showCreateTunnelModal, setShowCreateTunnelModal] = useState<{ dbPort: string; dbType: string } | null>(null)
  const [tunnelLocalPortInput, setTunnelLocalPortInput] = useState<string>('')
  const [tunnelNameInput, setTunnelNameInput] = useState<string>('')

  const fetchTunnels = useCallback(async () => {
    try {
      const list = await window.api.tunnel.list()
      const filtered = list.map((t: any) => ({
        id: t.id,
        listenPort: t.listenPort,
        targetPort: t.targetPort,
        active: t.active
      }))
      setActiveTunnels(filtered)
    } catch {}
  }, [])

  const fetchDatabaseInstances = useCallback(async () => {
    try {
      const script = `sudo ss -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true`
      const { stdout } = await exec(script)
      const lines = stdout.split('\n')
      const instances: DbInstance[] = []
      lines.forEach((l) => {
        const line = l.replace(/\s+/g, ' ').trim()
        if (!line || line.startsWith('Netid') || line.startsWith('Active') || line.startsWith('Proto')) return

        const tokens = line.split(' ')
        if (tokens.length < 4) return

        let localAddressPort = ''
        let processInfo = ''

        if (line.includes('LISTEN') || tokens.includes('LISTEN') || tokens[1] === 'LISTEN') {
          if (line.includes('users:')) {
            localAddressPort = tokens[4]
            processInfo = tokens.slice(6).join(' ')
          } else {
            localAddressPort = tokens[3]
            processInfo = tokens[tokens.length - 1]
          }

          if (localAddressPort) {
            const lastColonIdx = localAddressPort.lastIndexOf(':')
            if (lastColonIdx !== -1) {
              const address = localAddressPort.substring(0, lastColonIdx)
              const port = localAddressPort.substring(lastColonIdx + 1)

              let processName = '-'
              let pid = '-'
              if (processInfo.includes('users:')) {
                const match = processInfo.match(/users:\(\("([^"]+)",(?:pid|pgid)=(\d+)/)
                if (match) {
                  processName = match[1]
                  pid = match[2]
                }
              } else if (processInfo.includes('/')) {
                const match = processInfo.match(/(\d+)\/(.+)/)
                if (match) {
                  pid = match[1]
                  processName = match[2]
                }
              } else {
                processName = processInfo
              }

              let type: DbInstance['type'] = 'unknown'
              const portNum = parseInt(port)
              const lowerProc = processName.toLowerCase()

              if (portNum === 3306 || lowerProc.includes('mysql') || lowerProc.includes('mariadb')) type = 'mysql'
              else if (portNum === 5432 || lowerProc.includes('postgres')) type = 'postgres'
              else if (portNum === 6379 || lowerProc.includes('redis')) type = 'redis'
              else if (portNum === 27017 || lowerProc.includes('mongod')) type = 'mongodb'

              if (type !== 'unknown') {
                if (!instances.some((i) => i.port === port && i.type === type)) {
                  instances.push({ type, port, address, processName, pid })
                }
              }
            }
          }
        }
      })
      setDbInstances(instances)
      await fetchTunnels()
    } catch (e: any) {
      setError(e.message || 'Lỗi tải cơ sở dữ liệu')
    }
  }, [exec, fetchTunnels, setError])

  const handleOpenTunnelModal = (port: string, type: string) => {
    setTunnelLocalPortInput(port)
    setTunnelNameInput(`${type.toUpperCase()} Tunnel`)
    setShowCreateTunnelModal({ dbPort: port, dbType: type })
  }

  const handleCreateTunnel = async () => {
    if (!showCreateTunnelModal || !tunnelLocalPortInput || !tunnelNameInput) return
    setLoading(true)
    const result = await window.api.tunnel.startLocal(
      sessionId,
      tunnelNameInput,
      parseInt(tunnelLocalPortInput),
      'localhost',
      parseInt(showCreateTunnelModal.dbPort)
    )
    if (result.error) {
      alert('Lỗi tạo tunnel: ' + result.error)
    } else {
      setShowCreateTunnelModal(null)
      await fetchDatabaseInstances()
    }
    setLoading(false)
  }

  const handleStopTunnel = async (tunnelId: string) => {
    setLoading(true)
    await window.api.tunnel.stop(tunnelId)
    await fetchDatabaseInstances()
    setLoading(false)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchDatabaseInstances()
    setLoading(false)
  }, [fetchDatabaseInstances, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const interval = setInterval(fetchTunnels, 3000)
    return () => clearInterval(interval)
  }, [fetchTunnels])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {dbInstances.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <Database size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Không phát hiện hệ quản trị CSDL nào đang hoạt động</span>
          <span className="text-[10px] mt-1 text-[#45475a] max-w-xs text-center leading-relaxed">
            Để sử dụng tính năng này, hãy đảm bảo MySQL, Postgres, Redis hoặc MongoDB đang lắng nghe trên server.
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-4">
            {dbInstances.map((db, idx) => {
              const activeTunnel = activeTunnels.find((t) => t.targetPort === parseInt(db.port) && t.active)

              return (
                <div
                  key={idx}
                  className="bg-[#181825] border border-white/[0.04] rounded-xl p-5 flex flex-col justify-between hover:border-white/[0.08] transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[#fab387]/10 text-[#fab387]">
                        <Database size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#cdd6f4] uppercase">{db.type} Server</h4>
                        <span className="text-[10px] font-mono text-[#585b70]">
                          Port {db.port} | {db.processName}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                        activeTunnel ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'
                      }`}
                    >
                      {activeTunnel ? 'Tunnel Active' : 'Disconnected'}
                    </span>
                  </div>

                  {activeTunnel && (
                    <div className="mt-4 bg-[#11111b] border border-white/[0.02] rounded-lg p-2.5 text-[10px] font-mono text-[#a6adc8] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Cổng Cục Bộ:</span>
                        <span className="font-bold text-[#89b4fa]">{activeTunnel.listenPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Kết Nối:</span>
                        <span>localhost:{activeTunnel.listenPort}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-5">
                    {activeTunnel ? (
                      <button
                        onClick={() => handleStopTunnel(activeTunnel.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 transition-all active:scale-95"
                      >
                        <Square size={11} />
                        Hủy SSH Tunnel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenTunnelModal(db.port, db.type)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-all active:scale-95"
                      >
                        <ArrowRight size={11} />
                        Tạo SSH Tunnel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create Tunnel Modal */}
      {showCreateTunnelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCreateTunnelModal(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                Kích hoạt SSH Tunnel ({showCreateTunnelModal.dbType.toUpperCase()})
              </h3>
              <button onClick={() => setShowCreateTunnelModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên Kết Nối (Tunnel Name)</label>
                <input
                  type="text"
                  value={tunnelNameInput}
                  onChange={(e) => setTunnelNameInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Cổng Cục Bộ Máy Bạn (Local Listen Port)</label>
                <input
                  type="number"
                  placeholder="3307, 5433, 6380..."
                  value={tunnelLocalPortInput}
                  onChange={(e) => setTunnelLocalPortInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
                <span className="text-[10px] text-[#585b70] block leading-relaxed">
                  Cổng này sẽ được mở trên máy tính cá nhân của bạn. Kết nối tới `localhost:cổng` sẽ tự động chuyển hướng tới database trên server.
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTunnelModal(null)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateTunnel}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Tạo Tunnel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
