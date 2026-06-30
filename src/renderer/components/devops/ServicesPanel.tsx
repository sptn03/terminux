import { useState, useEffect, useCallback } from 'react'
import { Square, Play, RefreshCw } from 'lucide-react'

interface SystemService {
  name: string
  activeState: string
  subState: string
  description: string
  pid?: string
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

export default function ServicesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: ServicesPanelProps) {
  const [services, setServices] = useState<SystemService[]>([])
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

  const fetchServices = useCallback(async () => {
    try {
      const portsList = await fetchPortsList()
      setPorts(portsList)

      const cmd = `
        systemctl list-units --type=service --all --no-pager 2>/dev/null | grep -E "nginx|mysql|postgresql|docker|redis|apache2|mongodb|pm2|ssh" || true
        echo "===PIDS==="
        systemctl show --property=MainPID,Id nginx mysql postgresql redis docker apache2 mongodb ssh 2>/dev/null || true
      `
      const { stdout } = await exec(cmd)
      const parts = stdout.split('===PIDS===')
      const listPart = parts[0] || ''
      const pidsPart = parts[1] || ''

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
          serviceList.push({ name, activeState, subState, description, pid })
        }
      })
      setServices(serviceList)
    } catch (e: any) {
      setError(e.message || 'Lỗi kiểm tra trạng thái dịch vụ')
    }
  }, [exec, fetchPortsList, setError])

  const handleServiceAction = async (action: 'restart' | 'stop' | 'start', serviceName: string) => {
    setLoading(true)
    const { stderr } = await exec(`sudo systemctl ${action} ${serviceName} || systemctl ${action} ${serviceName}`)
    if (stderr && stderr.includes('Failed')) {
      alert('Lỗi thao tác: ' + stderr)
    }
    await fetchServices()
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {services.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <RefreshCw size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Không tìm thấy service DevOps nào</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                <th className="p-3">Dịch vụ (Service)</th>
                <th className="p-3">Mô tả</th>
                <th className="p-3">Cổng (Port)</th>
                <th className="p-3">Trạng Thái (Active)</th>
                <th className="p-3">Chi tiết (Substate)</th>
                <th className="p-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
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
                        {svc.activeState}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[#6c7086]">{svc.subState}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
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
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
