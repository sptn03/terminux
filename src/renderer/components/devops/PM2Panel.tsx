import { useState, useEffect, useCallback } from 'react'
import { Layers, Square, Play, RefreshCw, FileText, X, Plus, Trash2, RotateCw } from 'lucide-react'

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

  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')

  const [showStartAppModal, setShowStartAppModal] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppScript, setNewAppScript] = useState('')
  const [newAppCwd, setNewAppCwd] = useState('')
  const [newAppArgs, setNewAppArgs] = useState('')
  const [startingApp, setStartingApp] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<'script' | 'cwd' | null>(null)

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

  const handlePm2Action = async (action: 'restart' | 'stop' | 'start' | 'delete' | 'reload', pmId: number) => {
    setLoading(true)
    const { stderr } = await exec(`pm2 ${action} ${pmId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchPm2()
    setLoading(false)
  }

  const handleStartNewApp = async () => {
    if (!newAppName.trim() || !newAppScript.trim()) {
      alert('Vui lòng nhập tên ứng dụng và đường dẫn script!')
      return
    }

    setStartingApp(true)
    try {
      const name = newAppName.trim()
      const script = newAppScript.trim()
      const cwd = newAppCwd.trim() ? `--cwd "${newAppCwd.trim()}"` : ''
      const args = newAppArgs.trim() ? `-- ${newAppArgs.trim()}` : ''

      const cmd = `pm2 start "${script}" --name "${name}" ${cwd} ${args}`
      const res = await exec(cmd)
      if (res.code !== 0) {
        throw new Error(res.stderr || 'Không thể start ứng dụng PM2')
      }
      
      alert(`Đã khởi chạy ứng dụng "${name}" thành công!`)
      setShowStartAppModal(false)
      setNewAppName('')
      setNewAppScript('')
      setNewAppCwd('')
      setNewAppArgs('')
      await fetchPm2()
    } catch (e: any) {
      alert('Lỗi khởi chạy ứng dụng: ' + e.message)
    } finally {
      setStartingApp(false)
    }
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

  const handleInstallPm2 = async () => {
    setInstalling(true)
    setInstallLog('Đang chuẩn bị cài đặt PM2...\n')
    try {
      setInstallLog(prev => prev + 'Đang kiểm tra Node.js & NPM...\n')
      const checkNpm = await exec('npm -v 2>/dev/null')
      if (checkNpm.code !== 0) {
        setInstallLog(prev => prev + 'Không tìm thấy NPM. Đang tiến hành cài đặt Node.js & NPM từ hệ thống...\n')
        await exec('sudo apt-get update')
        const installNode = await exec('sudo apt-get install -y nodejs npm')
        if (installNode.code !== 0) {
          setInstallLog(prev => prev + 'Cài đặt Node.js qua apt thất bại. Đang cấu hình NodeSource...\n')
          await exec('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs')
        }
      }

      setInstallLog(prev => prev + 'Đang tiến hành cài đặt PM2 toàn cục (npm install -g pm2)...\n')
      const installPm2 = await exec('sudo npm install -g pm2 || npm install -g pm2')
      if (installPm2.code !== 0) {
        throw new Error(installPm2.stderr || 'Không thể cài đặt PM2. Vui lòng kiểm tra quyền sudo.')
      }

      setInstallLog(prev => prev + 'Cài đặt PM2 thành công!\n')
      alert('Cài đặt PM2 thành công!')
      await loadData()
    } catch (e: any) {
      setInstallLog(prev => prev + `Lỗi: ${e.message}\n`)
      alert('Lỗi cài đặt PM2: ' + e.message)
    } finally {
      setInstalling(false)
    }
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
      {pm2Installed && (
        <div className="flex justify-between items-center mb-3 shrink-0">
          <span className="text-xs font-bold text-[#cdd6f4]">Quản lý tiến trình NodeJS (PM2)</span>
          <button
            onClick={() => setShowStartAppModal(true)}
            className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Plus size={12} /> Khởi chạy ứng dụng mới
          </button>
        </div>
      )}

      {!pm2Installed ? (
        <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-md mx-auto p-6 text-center space-y-4">
          <Layers size={48} className="text-[#89b4fa] opacity-60 animate-bounce" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#cdd6f4]">PM2 chưa được cài đặt trên máy chủ</h3>
            <p className="text-xs text-[#585b70]">
              Không tìm thấy lệnh pm2 trên máy chủ này. Cần cài đặt Node.js, NPM và PM2 toàn cục để quản lý ứng dụng Node.js.
            </p>
          </div>

          {installing ? (
            <div className="w-full bg-[#181825] border border-white/5 rounded-xl p-4 flex flex-col text-left space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#89b4fa] tracking-wider animate-pulse flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Đang cài đặt PM2...
              </span>
              <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[9px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                {installLog}
              </pre>
            </div>
          ) : (
            <button
              onClick={handleInstallPm2}
              className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
            >
              Cài đặt PM2 tự động
            </button>
          )}
        </div>
      ) : pm2Apps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70] space-y-3">
          <Layers size={36} className="opacity-30 animate-pulse" />
          <span className="text-xs font-semibold">Không có app PM2 nào đang chạy</span>
          <button
            onClick={() => setShowStartAppModal(true)}
            className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all"
          >
            Khởi chạy ứng dụng mới
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
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
                          onClick={() => handlePm2Action('reload', app.pm_id)}
                          className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                          title="Reload (Zero Downtime)"
                        >
                          <RotateCw size={12} />
                        </button>
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
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có chắc chắn muốn xóa tiến trình PM2 "${app.name}" không?`)) {
                              handlePm2Action('delete', app.pm_id)
                            }
                          }}
                          className="p-1 rounded hover:bg-white/5 text-[#f38ba8]/70 hover:text-[#f38ba8]"
                          title="Delete Process"
                        >
                          <Trash2 size={12} />
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

      {/* Start App Modal */}
      {showStartAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowStartAppModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Khởi chạy ứng dụng PM2 mới
              </h3>
              <button onClick={() => setShowStartAppModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên ứng dụng (App Name) *</label>
                <input
                  type="text"
                  placeholder="ví dụ: my-node-server"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Đường dẫn Script/File chạy (Script Path) *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ví dụ: /var/www/app/index.js hoặc app.js"
                    value={newAppScript}
                    onChange={(e) => setNewAppScript(e.target.value)}
                    className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerTarget('script')}
                    className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs flex items-center justify-center"
                    title="Chọn Tệp"
                  >
                    Duyệt...
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Thư mục làm việc (Working Directory - CWD)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ví dụ: /var/www/app (để trống nếu chạy cùng thư mục)"
                    value={newAppCwd}
                    onChange={(e) => setNewAppCwd(e.target.value)}
                    className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerTarget('cwd')}
                    className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs flex items-center justify-center"
                    title="Chọn Thư Mục"
                  >
                    Duyệt...
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tham số truyền vào (Arguments)</label>
                <input
                  type="text"
                  placeholder="ví dụ: --port=3000 --env=production"
                  value={newAppArgs}
                  onChange={(e) => setNewAppArgs(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowStartAppModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleStartNewApp}
                  disabled={startingApp}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {startingApp ? 'Đang chạy...' : 'Khởi chạy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickerTarget && (
        <RemotePathPicker
          visible={true}
          mode={pickerTarget === 'script' ? 'file' : 'dir'}
          exec={exec}
          onClose={() => setPickerTarget(null)}
          onSelect={(path) => {
            if (pickerTarget === 'script') setNewAppScript(path)
            if (pickerTarget === 'cwd') setNewAppCwd(path)
          }}
        />
      )}
    </div>
  )
}

interface RemotePathPickerProps {
  visible: boolean
  mode: 'file' | 'dir'
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  onClose: () => void
  onSelect: (path: string) => void
}

function RemotePathPicker({ mode, exec, onClose, onSelect }: RemotePathPickerProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState<{ name: string; isDir: boolean }[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const sanitizedPath = path.replace(/"/g, '\\"')
      const cmd = `cd "${sanitizedPath}" && ls -F -1`
      const res = await exec(cmd)
      if (res.code === 0) {
        const parsed = res.stdout
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f && f !== './' && f !== '../')
          .map((f) => {
            const isDir = f.endsWith('/')
            const name = isDir ? f.slice(0, -1) : f
            return { name, isDir }
          })

        parsed.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1
          if (!a.isDir && b.isDir) return 1
          return a.name.localeCompare(b.name)
        })

        setItems(parsed)
        setCurrentPath(path)
      } else {
        alert('Lỗi đọc thư mục: ' + res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [exec])

  useEffect(() => {
    fetchDir('/')
  }, [fetchDir])

  const handleGoUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const parent = '/' + parts.join('/')
    fetchDir(parent)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] h-[480px] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#181825]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
            Chọn {mode === 'file' ? 'Tệp tin' : 'Thư mục'} trên Server
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
            <X size={14} />
          </button>
        </div>

        <div className="p-2.5 bg-[#11111b] border-b border-white/5 flex gap-2 items-center">
          <button
            onClick={handleGoUp}
            disabled={currentPath === '/'}
            className="px-2 py-1 rounded bg-white/5 text-xs text-[#cdd6f4] hover:bg-white/10 disabled:opacity-40"
          >
            ← Lên
          </button>
          <input
            type="text"
            readOnly
            value={currentPath}
            className="flex-1 bg-[#181825] border border-white/5 rounded px-2 py-1 text-xs text-[#a6adc8] font-mono outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-[#585b70] gap-2">
              <RefreshCw size={14} className="animate-spin text-[#89b4fa]" /> Đang tải...
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-[#585b70]">
              Thư mục trống.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
                  if (item.isDir) {
                    fetchDir(newPath)
                  } else {
                    if (mode === 'file') {
                      onSelect(newPath)
                      onClose()
                    }
                  }
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-[#a6adc8] hover:text-[#cdd6f4] hover:bg-white/[0.02] transition-all"
              >
                <span className="shrink-0 text-sm">
                  {item.isDir ? '📁' : '📄'}
                </span>
                <span className="truncate">{item.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-white/5 bg-[#181825] flex justify-between items-center">
          <span className="text-[9px] text-[#585b70]">
            {mode === 'file' ? 'Click file để chọn' : 'Bấm Chọn để lấy thư mục hiện tại'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-[#cdd6f4]"
            >
              Hủy
            </button>
            {mode === 'dir' && (
              <button
                type="button"
                onClick={() => {
                  onSelect(currentPath)
                  onClose()
                }}
                className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] text-xs font-bold"
              >
                Chọn thư mục này
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
