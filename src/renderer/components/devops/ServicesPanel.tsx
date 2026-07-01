import { useState, useEffect, useCallback } from 'react'
import { Square, Play, RefreshCw, FileText, X, Search } from 'lucide-react'

interface SystemService {
  name: string
  activeState: string
  subState: string
  description: string
  pid?: string
  enabled?: boolean
}

interface ListeningPort {
  proto: string
  address: string
  port: string
  processName: string
  pid: string
}

interface ServicesPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export default function ServicesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: ServicesPanelProps) {
  const [services, setServices] = useState<SystemService[]>([])
  const [ports, setPorts] = useState<ListeningPort[]>([])
  const [showAllServices, setShowAllServices] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceLogsModal, setServiceLogsModal] = useState<{ name: string; logs: string } | null>(null)

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

  const fetchServices = useCallback(async () => {
    try {
      const portsList = await fetchPortsList()
      setPorts(portsList)

      let grepFilter = ''
      if (!showAllServices) {
        grepFilter = `| grep -E "nginx|mysql|postgresql|docker|redis|apache2|mongodb|pm2|ssh|mariadb|memcached|rabbitmq|elasticsearch|grafana|prometheus|jenkins|tomcat|haproxy|fail2ban|ufw|certbot"`
      }

      const cmd = `
        systemctl list-units --type=service --all --no-pager 2>/dev/null ${grepFilter} || true
        echo "===ENABLED==="
        systemctl list-unit-files --type=service --no-pager 2>/dev/null | grep -E "enabled|disabled" || true
        echo "===PIDS==="
        systemctl show --property=MainPID,Id $(systemctl list-units --type=service --all --no-pager 2>/dev/null | awk '{print $1}' | grep '.service' | head -50) 2>/dev/null || true
      `
      const { stdout } = await exec(cmd)
      const mainParts = stdout.split('===ENABLED===')
      const listPart = mainParts[0] || ''
      const rest = (mainParts[1] || '').split('===PIDS===')
      const enabledPart = rest[0] || ''
      const pidsPart = rest[1] || ''

      // Parse enabled/disabled status
      const enabledMap: Record<string, boolean> = {}
      enabledPart.split('\n').forEach((l) => {
        const line = l.trim()
        const match = line.match(/^(\S+)\.service\s+(enabled|disabled)/)
        if (match) {
          enabledMap[match[1]] = match[2] === 'enabled'
        }
      })

      const servicePids: Record<string, string> = {}
      let currentId = ''
      pidsPart.split('\n').forEach((l) => {
        const line = l.trim()
        if (line.startsWith('Id=')) {
          currentId = line.replace('Id=', '').replace('.service', '')
        } else if (line.startsWith('MainPID=') && currentId) {
          const pid = line.replace('MainPID=', '')
          if (pid && pid !== '0') {
            servicePids[currentId] = pid
          }
        }
      })

      const lines = listPart.split('\n')
      const serviceList: SystemService[] = []
      lines.forEach((l) => {
        const cleaned = l.replace(/\s+/g, ' ').trim()
        const parts = cleaned.split(' ')
        if (parts.length >= 4 && parts[0].endsWith('.service')) {
          const name = parts[0].replace('.service', '')
          const activeState = parts[2]
          const subState = parts[3]
          const description = parts.slice(4).join(' ')
          const pid = servicePids[name] || ''
          const enabled = enabledMap[name]
          serviceList.push({ name, activeState, subState, description, pid, enabled })
        }
      })
      setServices(serviceList)
    } catch (e: any) {
      setError(e.message || 'Lỗi kiểm tra trạng thái dịch vụ')
    }
  }, [exec, fetchPortsList, setError, showAllServices])

  const handleServiceAction = async (action: 'restart' | 'stop' | 'start' | 'enable' | 'disable', serviceName: string) => {
    setLoading(true)
    const { stderr } = await exec(`sudo systemctl ${action} ${serviceName} || systemctl ${action} ${serviceName}`)
    if (stderr && stderr.includes('Failed')) {
      alert('Lỗi thao tác: ' + stderr)
    }
    await fetchServices()
    setLoading(false)
  }

  const handleViewLogs = async (serviceName: string) => {
    setLoading(true)
    const { stdout } = await exec(`sudo journalctl -u ${serviceName} --no-pager -n 80 2>/dev/null || echo "journalctl không khả dụng"`)
    setServiceLogsModal({ name: serviceName, logs: stripAnsi(stdout || 'Không có log') })
    setLoading(false)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchServices()
    setLoading(false)
  }, [fetchServices, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const filteredServices = services.filter((svc) => {
    if (!serviceSearch) return true
    const q = serviceSearch.toLowerCase()
    return svc.name.toLowerCase().includes(q) || svc.description.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#585b70]" />
            <input
              type="text"
              placeholder="Tìm service..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              className="bg-[#181825] border border-white/5 rounded-lg pl-7 pr-3 py-1.5 text-xs text-[#cdd6f4] outline-none w-48"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#a6adc8] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAllServices}
            onChange={(e) => setShowAllServices(e.target.checked)}
            className="rounded bg-[#1e1e2e] border-white/5"
          />
          Hiển thị tất cả services
        </label>
      </div>

      {filteredServices.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <RefreshCw size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Không tìm thấy service nào</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                <th className="p-3">Dịch vụ (Service)</th>
                <th className="p-3">Mô tả</th>
                <th className="p-3">Cổng (Port)</th>
                <th className="p-3">Trạng Thái</th>
                <th className="p-3">Boot</th>
                <th className="p-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((svc) => {
                let svcPorts: string[] = []
                if (svc.pid) {
                  svcPorts = ports.filter((p) => p.pid === svc.pid).map((p) => p.port)
                }
                if (svcPorts.length === 0) {
                  const lowerName = svc.name.toLowerCase()
                  svcPorts = ports
                    .filter((p) => {
                      const proc = p.processName.toLowerCase()
                      if (lowerName === 'nginx' && proc.includes('nginx')) return true
                      if (lowerName === 'mysql' && (proc.includes('mysqld') || proc.includes('mysql'))) return true
                      if (lowerName === 'redis' && proc.includes('redis-server')) return true
                      if (lowerName === 'postgresql' && proc.includes('postgres')) return true
                      if (lowerName === 'mongodb' && proc.includes('mongod')) return true
                      if (lowerName === 'ssh' && proc.includes('sshd')) return true
                      return false
                    })
                    .map((p) => p.port)
                }
                const uniquePorts = Array.from(new Set(svcPorts))

                return (
                  <tr key={svc.name} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 font-bold text-[#cdd6f4]">{svc.name}</td>
                    <td className="p-3 text-[#a6adc8] max-w-xs truncate" title={svc.description}>
                      {svc.description}
                    </td>
                    <td className="p-3 font-mono">
                      {uniquePorts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniquePorts.map((p) => (
                            <span key={p} className="bg-[#89b4fa]/10 text-[#89b4fa] px-1.5 py-0.5 rounded text-[10px] font-bold">
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
                          svc.activeState === 'active' ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                        }`}
                      >
                        {svc.activeState} ({svc.subState})
                      </span>
                    </td>
                    <td className="p-3">
                      {svc.enabled !== undefined && (
                        <span className={`text-[10px] font-semibold ${svc.enabled ? 'text-[#a6e3a1]' : 'text-[#585b70]'}`}>
                          {svc.enabled ? 'enabled' : 'disabled'}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center">
                        {svc.subState === 'running' ? (
                          <button
                            onClick={() => handleServiceAction('stop', svc.name)}
                            className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                            title="Stop Service"
                          >
                            <Square size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleServiceAction('start', svc.name)}
                            className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                            title="Start Service"
                          >
                            <Play size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handleServiceAction('restart', svc.name)}
                          className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                          title="Restart Service"
                        >
                          <RefreshCw size={12} />
                        </button>
                        <button
                          onClick={() => handleViewLogs(svc.name)}
                          className="p-1 rounded hover:bg-white/5 text-[#f9e2af]"
                          title="View Logs (journalctl)"
                        >
                          <FileText size={12} />
                        </button>
                        {svc.enabled !== undefined && (
                          <button
                            onClick={() => handleServiceAction(svc.enabled ? 'disable' : 'enable', svc.name)}
                            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                            title={svc.enabled ? 'Disable on boot' : 'Enable on boot'}
                          >
                            {svc.enabled ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Service Logs Modal */}
      {serviceLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setServiceLogsModal(null)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                Journal Logs — {serviceLogsModal.name}
              </h3>
              <button onClick={() => setServiceLogsModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
              {serviceLogsModal.logs}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
