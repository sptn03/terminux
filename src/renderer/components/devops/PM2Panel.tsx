import { useState, useEffect, useCallback } from 'react'
import { Layers, Square, Play, RefreshCw, FileText, X } from 'lucide-react'

interface PM2App {
  name: string
  pm_id: number
  pid: number
  status: string
  cpu: number
  memory: number // MB
  restarts: number
  outLog?: string
  errLog?: string
}

interface ListeningPort {
  proto: string
  address: string
  port: string
  processName: string
  pid: string
}

interface PM2PanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export default function PM2Panel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: PM2PanelProps) {
  const [pm2Apps, setPm2Apps] = useState<PM2App[]>([])
  const [pm2Installed, setPm2Installed] = useState(true)
  const [selectedAppLogs, setSelectedAppLogs] = useState<{ name: string; logs: string } | null>(null)
  const [ports, setPorts] = useState<ListeningPort[]>([])

  const fetchPortsList = useCallback(async (): Promise<ListeningPort[]> => {
    const cmd = `sudo ss -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true`
    const { stdout } = await exec(cmd)
    if (!stdout) return []

    const portLines = stdout.split('\n')
    const parsedPorts: ListeningPort[] = []
    portLines.forEach((l) => {
      const line = l.replace(/\s+/g, ' ').trim()
      if (!line || line.startsWith('Netid') || line.startsWith('Active') || line.startsWith('Proto')) return

      const tokens = line.split(' ')
      if (tokens.length < 4) return

      const proto = tokens[0]
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

            parsedPorts.push({
              proto: proto.toUpperCase(),
              address,
              port,
              processName,
              pid
            })
          }
        }
      }
    })
    return parsedPorts
  }, [exec])

  const fetchPm2 = useCallback(async () => {
    try {
      const portsList = await fetchPortsList()
      setPorts(portsList)

      const { stdout, code } = await exec('pm2 jlist 2>/dev/null')
      if (code !== 0 || !stdout) {
        setPm2Installed(false)
        setPm2Apps([])
        return
      }
      setPm2Installed(true)
      try {
        const data = JSON.parse(stdout)
        const apps = data.map((app: any) => ({
          name: app.name || 'Unnamed',
          pm_id: app.pm_id ?? 0,
          pid: app.pid ?? 0,
          status: app.pm2_env?.status || 'unknown',
          cpu: app.monit?.cpu ?? 0,
          memory: Math.round((app.monit?.memory ?? 0) / (1024 * 1024)),
          restarts: app.pm2_env?.restart_time ?? 0,
          outLog: app.pm2_env?.pm_out_log_path,
          errLog: app.pm2_env?.pm_err_log_path
        }))
        setPm2Apps(apps)
      } catch {
        setPm2Installed(false)
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi tải dữ liệu PM2')
    }
  }, [exec, fetchPortsList, setError])

  const handlePm2Action = async (action: 'restart' | 'stop' | 'start' | 'delete', pmId: number) => {
    setLoading(true)
    const { stderr } = await exec(`pm2 ${action} ${pmId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchPm2()
    setLoading(false)
  }

  const handleViewPm2Logs = async (app: PM2App) => {
    setLoading(true)
    let logs = ''
    if (app.outLog || app.errLog) {
      const cmd = `
        echo "=== STDOUT LOGS (Last 100 lines) ==="
        if [ -f "${app.outLog}" ]; then tail -n 100 "${app.outLog}"; else echo "No stdout log file found"; fi
        echo ""
        echo "=== STDERR LOGS (Last 100 lines) ==="
        if [ -f "${app.errLog}" ]; then tail -n 100 "${app.errLog}"; else echo "No stderr log file found"; fi
      `
      const { stdout } = await exec(cmd)
      logs = stdout
    } else {
      const { stdout } = await exec(`tail -n 100 ~/.pm2/logs/${app.name}-out.log 2>/dev/null || echo "No logs found."`)
      logs = stdout
    }
    setSelectedAppLogs({ name: app.name, logs: stripAnsi(logs) || 'Không tìm thấy log nào.' })
    setLoading(false)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchPm2()
    setLoading(false)
  }, [fetchPm2, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!pm2Installed ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <Layers size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">PM2 không được cài đặt trên máy chủ</span>
          <span className="text-[10px] mt-1 text-[#45475a] max-w-xs text-center leading-relaxed">
            Vui lòng cài đặt PM2 toàn cục (ví dụ: `npm install -g pm2`) để sử dụng tính năng quản lý tiến trình.
          </span>
        </div>
      ) : pm2Apps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <Layers size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Không có app PM2 nào đang chạy</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                <th className="p-3">ID</th>
                <th className="p-3">Tên Ứng Dụng</th>
                <th className="p-3">PID</th>
                <th className="p-3">Cổng (Port)</th>
                <th className="p-3">Trạng Thái</th>
                <th className="p-3 text-right">CPU</th>
                <th className="p-3 text-right">Memory</th>
                <th className="p-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {pm2Apps.map((app) => {
                const appPorts = ports.filter((p) => p.pid === String(app.pid)).map((p) => p.port)
                const uniquePorts = Array.from(new Set(appPorts))

                return (
                  <tr key={app.pm_id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 font-mono text-[#6c7086]">{app.pm_id}</td>
                    <td className="p-3 font-bold text-[#cdd6f4]">{app.name}</td>
                    <td className="p-3 font-mono text-[#6c7086]">{app.pid}</td>
                    <td className="p-3 font-mono">
                      {uniquePorts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniquePorts.map((p) => (
                            <span key={p} className="bg-[#a6e3a1]/10 text-[#a6e3a1] px-1.5 py-0.5 rounded text-[10px] font-bold">
                              :{p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#585b70]">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                          app.status === 'online' ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">{app.cpu}%</td>
                    <td className="p-3 text-right font-mono">{app.memory} MB</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        {app.status === 'online' ? (
                          <button
                            onClick={() => handlePm2Action('stop', app.pm_id)}
                            className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                            title="Stop Process"
                          >
                            <Square size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePm2Action('start', app.pm_id)}
                            className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                            title="Start Process"
                          >
                            <Play size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handlePm2Action('restart', app.pm_id)}
                          className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                          title="Restart Process"
                        >
                          <RefreshCw size={12} />
                        </button>
                        <button
                          onClick={() => handleViewPm2Logs(app)}
                          className="p-1 rounded hover:bg-white/5 text-[#fab387]"
                          title="View Logs"
                        >
                          <FileText size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Modal for PM2 */}
      {selectedAppLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAppLogs(null)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-gradient-to-r from-[#181825] to-transparent">
              <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fab387]" />
                PM2 Logs: {selectedAppLogs.name}
              </h3>
              <button onClick={() => setSelectedAppLogs(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={15} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text selection:bg-[#fab387]/25 scrollbar-thin">
              {selectedAppLogs.logs}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
