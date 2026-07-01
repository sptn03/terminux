import { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Layers, HardDrive, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'

const MAX_HISTORY = 60

function Sparkline({ data, color, label }: { data: number[]; color: string; label?: string }) {
  if (data.length < 2) return null
  const w = 160
  const h = 32
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / (MAX_HISTORY - 1)) * w
    const y = h - (v / max) * (h - 2) - 1
    return `${x},${y}`
  }).join(' ')
  const fillPoints = `0,${h} ${points} ${(data.length - 1) / (MAX_HISTORY - 1) * w},${h}`

  const prev5 = data.slice(-6, -1)
  const last = data[data.length - 1]
  const avg5 = prev5.length > 0 ? prev5.reduce((a, b) => a + b, 0) / prev5.length : last
  const diff = last - avg5
  const TrendIcon = diff > 1.5 ? TrendingUp : diff < -1.5 ? TrendingDown : Minus
  const trendColor = diff > 1.5 ? '#f38ba8' : diff < -1.5 ? '#a6e3a1' : '#585b70'

  return (
    <div className="flex items-center gap-2 mt-2">
      <svg width={w} height={h} className="shrink-0">
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#spark-${color.replace('#', '')})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <TrendIcon size={10} style={{ color: trendColor }} className="shrink-0" />
    </div>
  )
}

export interface ListeningPort {
  proto: string
  address: string
  port: string
  processName: string
  pid: string
}

export interface NetworkIface {
  name: string
  state: 'UP' | 'DOWN' | 'UNKNOWN'
  ipv4: string[]
  ipv6: string[]
  mac?: string
  type: 'physical' | 'vpn' | 'loopback' | 'bridge' | 'other'
}

export interface SysInfo {
  [key: string]: any
  os?: string
  uptime?: string
  load?: string
  mem_total?: number
  mem_used?: number
  mem_free?: number
  mem_avail?: number
  swap_total?: number
  swap_used?: number
  disk_total?: number
  disk_used?: number
  disk_free?: number
  disk_percent?: number
  cpu_used?: number
  cpu_cores?: number
  cpu_model?: string
  local_ip?: string
  public_ip?: string
  network_ifaces?: NetworkIface[]
}

interface OverviewPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
  alertCpu: number
  alertMem: number
  alertDisk: number
  triggerResourceAlert: (cpu: number, mem: number, disk: number) => void
}

export default function OverviewPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError,
  alertCpu,
  alertMem,
  alertDisk,
  triggerResourceAlert
}: OverviewPanelProps) {
  const [sysInfo, setSysInfo] = useState<SysInfo | null>(null)
  const [ports, setPorts] = useState<ListeningPort[]>([])
  const updateTabState = useTerminalStore((s) => s.updateTabState)

  const cpuHistoryRef = useRef<number[]>([])
  const memHistoryRef = useRef<number[]>([])
  const diskHistoryRef = useRef<number[]>([])
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [diskHistory, setDiskHistory] = useState<number[]>([])

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

  const fetchOverview = useCallback(async () => {
    try {
      const portsList = await fetchPortsList()
      setPorts(portsList)

      const script = `
        os=$(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2 2>/dev/null || echo "Linux")
        uptime_str=$(uptime -p 2>/dev/null || echo "Unknown Uptime")
        load_avg=$(uptime | awk -F'load average:' '{ print $2 }' | xargs 2>/dev/null || echo "0, 0, 0")
        cpu_cores=$(nproc 2>/dev/null || echo "1")
        cpu_model=$(cat /proc/cpuinfo | grep 'model name' | head -n 1 | cut -d':' -f2 | xargs 2>/dev/null || echo "Generic CPU")
        mem_total=$(free -m 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)
        mem_used=$(free -m 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
        mem_free=$(free -m 2>/dev/null | awk '/Mem:/ {print $4}' || echo 0)
        mem_avail=$(free -m 2>/dev/null | awk '/Mem:/ {print $7}' || echo 0)
        swap_total=$(free -m 2>/dev/null | awk '/Swap:/ {print $2}' || echo 0)
        swap_used=$(free -m 2>/dev/null | awk '/Swap:/ {print $3}' || echo 0)
        disk_total=$(df -BM / | awk 'NR==2 {print $2}' | sed 's/M//' 2>/dev/null || echo 0)
        disk_used=$(df -BM / | awk 'NR==2 {print $3}' | sed 's/M//' 2>/dev/null || echo 0)
        disk_free=$(df -BM / | awk 'NR==2 {print $4}' | sed 's/M//' 2>/dev/null || echo 0)
        disk_percent=$(df -m / | awk 'NR==2 {print $5}' | sed 's/%//' 2>/dev/null || echo 0)
        cpu_idle=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' 2>/dev/null || echo 100)
        cpu_used=$(echo "100 - $cpu_idle" | bc 2>/dev/null || awk "BEGIN {print 100 - $cpu_idle}" 2>/dev/null || echo 0)
        local_ip=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "127.0.0.1")
        public_ip=$(curl -s --connect-timeout 1 ifconfig.me 2>/dev/null || echo "Unknown")

        echo "os: $os"
        echo "uptime: $uptime_str"
        echo "load: $load_avg"
        echo "cpu_cores: $cpu_cores"
        echo "cpu_model: $cpu_model"
        echo "mem_total: $mem_total"
        echo "mem_used: $mem_used"
        echo "mem_free: $mem_free"
        echo "mem_avail: $mem_avail"
        echo "swap_total: $swap_total"
        echo "swap_used: $swap_used"
        echo "disk_total: $disk_total"
        echo "disk_used: $disk_used"
        echo "disk_free: $disk_free"
        echo "disk_percent: $disk_percent"
        echo "cpu_used: $cpu_used"
        echo "local_ip: $local_ip"
        echo "public_ip: $public_ip"
        echo "===IFACES==="
        ip a 2>/dev/null || ifconfig 2>/dev/null || true
      `
      const { stdout } = await exec(script)
      if (!stdout) return

      const [kvSection, ifaceSection = ''] = stdout.split('===IFACES===')
      const lines = kvSection.split('\n')
      const info: SysInfo = {}
      lines.forEach((l) => {
        const lineParts = l.split(': ')
        if (lineParts.length >= 2) {
          const key = lineParts[0].trim()
          const value = lineParts.slice(1).join(': ').trim()
          if (
            [
              'mem_total',
              'mem_used',
              'mem_free',
              'mem_avail',
              'swap_total',
              'swap_used',
              'disk_total',
              'disk_used',
              'disk_free',
              'disk_percent',
              'cpu_used',
              'cpu_cores'
            ].includes(key)
          ) {
            info[key] = parseFloat(value) || 0
          } else {
            info[key] = value
          }
        }
      })

      const SKIP = /^(docker|veth|br-|lo$)/
      const VPN_RE = /^(tailscale|tun|wg|vpn)/i
      const ifaces: NetworkIface[] = []
      let cur: NetworkIface | null = null
      ifaceSection.split('\n').forEach((raw) => {
        const line = raw.trim()
        const ifaceMatch = line.match(/^\d+:\s+(\S+?)(@\S+)?:\s+<([^>]*)>/)
        if (ifaceMatch) {
          if (cur && !SKIP.test(cur.name)) ifaces.push(cur)
          const name = ifaceMatch[1]
          const flags = ifaceMatch[3] || ''
          const state = flags.includes('UP') ? 'UP' : 'DOWN'
          const type: NetworkIface['type'] = name === 'lo' ? 'loopback' : VPN_RE.test(name) ? 'vpn' : 'physical'
          cur = { name, state: state as any, ipv4: [], ipv6: [], type }
          return
        }
        if (!cur) return
        const macMatch = line.match(/link\/ether\s+([\da-f:]+)/i)
        if (macMatch) {
          cur.mac = macMatch[1]
          return
        }
        const v4Match = line.match(/inet\s+([\d.]+\/\d+)/)
        if (v4Match) {
          cur.ipv4.push(v4Match[1])
          return
        }
        const v6Match = line.match(/inet6\s+([\da-f:]+\/\d+).*scope global/)
        if (v6Match) {
          cur.ipv6.push(v6Match[1])
        }
      })
      if (cur && !SKIP.test((cur as NetworkIface).name)) ifaces.push(cur as NetworkIface)
      info.network_ifaces = ifaces

      setSysInfo(info)

      const cpuUsed = info.cpu_used || 0
      const memTotal = info.mem_total || 1
      const memUsed = info.mem_used || 0
      const memPercent = (memUsed / memTotal) * 100
      const diskPercent = info.disk_percent || 0

      // Update sparkline history
      cpuHistoryRef.current = [...cpuHistoryRef.current, cpuUsed].slice(-MAX_HISTORY)
      memHistoryRef.current = [...memHistoryRef.current, memPercent].slice(-MAX_HISTORY)
      diskHistoryRef.current = [...diskHistoryRef.current, diskPercent].slice(-MAX_HISTORY)
      setCpuHistory([...cpuHistoryRef.current])
      setMemHistory([...memHistoryRef.current])
      setDiskHistory([...diskHistoryRef.current])

      if (cpuUsed > alertCpu || memPercent > alertMem || diskPercent > alertDisk) {
        updateTabState(sessionId, { alertStatus: 'danger' })
        triggerResourceAlert(cpuUsed, memPercent, diskPercent)
      } else {
        updateTabState(sessionId, { alertStatus: 'normal' })
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi tải dữ liệu Overview')
    }
  }, [exec, fetchPortsList, sessionId, updateTabState, alertCpu, alertMem, alertDisk, triggerResourceAlert, setError])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchOverview()
    setLoading(false)
  }, [fetchOverview, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const interval = setInterval(fetchOverview, 4000)
    return () => clearInterval(interval)
  }, [fetchOverview])

  if (!sysInfo) return null

  return (
    <div className="flex-1 overflow-y-auto space-y-6">
      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Hệ Điều Hành</span>
          <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.os || 'Linux'}</span>
        </div>
        <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Uptime</span>
          <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.uptime || 'Unknown'}</span>
        </div>
        <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Tải trung bình (Load Avg)</span>
          <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.load || '0, 0, 0'}</span>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
          <Activity className="text-[#89b4fa] mb-2" size={16} />
          <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">CPU Utilization</span>
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className="text-[#89b4fa] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${sysInfo.cpu_used || 0}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-lg font-bold">{(sysInfo.cpu_used || 0).toFixed(1)}%</span>
            </div>
          </div>
          <Sparkline data={cpuHistory} color="#89b4fa" />
        </div>

        {(() => {
          const total = sysInfo.mem_total || 1
          const used = sysInfo.mem_used || 0
          const percent = Math.round((used / total) * 100)
          return (
            <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
              <Layers className="text-[#a6e3a1] mb-2" size={16} />
              <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">RAM Utilization</span>
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-[#a6e3a1] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${percent}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-lg font-bold">{percent}%</span>
                  <span className="text-[9px] text-[#585b70]">{used} / {total} MB</span>
                </div>
              </div>
              <Sparkline data={memHistory} color="#a6e3a1" />
            </div>
          )
        })()}

        {(() => {
          const percent = sysInfo.disk_percent || 0
          const used = ((sysInfo.disk_used || 0) / 1024).toFixed(1)
          const total = ((sysInfo.disk_total || 0) / 1024).toFixed(0)
          return (
            <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
              <HardDrive className="text-[#fab387] mb-2" size={16} />
              <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">Disk Utilization (/)</span>
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-[#fab387] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${percent}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-lg font-bold">{percent}%</span>
                  <span className="text-[9px] text-[#585b70]">{used} / {total} GB</span>
                </div>
              </div>
              <Sparkline data={diskHistory} color="#fab387" />
            </div>
          )
        })()}
      </div>

      {/* System Details & Open Ports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
            Thông tin hệ thống chi tiết
          </h3>
          <div className="space-y-3 text-xs flex-1">
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
              <span className="text-[#585b70]">CPU Model</span>
              <span className="font-semibold text-[#cdd6f4] max-w-[200px] truncate" title={sysInfo.cpu_model}>
                {sysInfo.cpu_model || 'Generic CPU'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
              <span className="text-[#585b70]">CPU Cores</span>
              <span className="font-semibold text-[#cdd6f4]">{sysInfo.cpu_cores || 1} Cores</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
              <span className="text-[#585b70]">Swap Memory</span>
              <span className="font-semibold text-[#cdd6f4]">
                {sysInfo.swap_used || 0} MB / {sysInfo.swap_total || 0} MB
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
              <span className="text-[#585b70]">IP Nội Bộ (Private IP)</span>
              <span className="font-mono text-[#cdd6f4]">{sysInfo.local_ip || '127.0.0.1'}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-[#585b70]">IP Công Cộng (Public IP)</span>
              <span className="font-mono text-[#cdd6f4]">{sysInfo.public_ip || 'Unknown'}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col max-h-[300px] overflow-hidden">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f9e2af]" />
            Cổng mạng đang lắng nghe (Listening Ports)
          </h3>
          <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-thin">
            {ports.length === 0 ? (
              <div className="text-center text-[#585b70] text-xs py-8">Không quét được cổng nào đang mở.</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="pb-2">Port</th>
                    <th className="pb-2">Proto</th>
                    <th className="pb-2">Bound Address</th>
                    <th className="pb-2">Process (PID)</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p, idx) => (
                    <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="py-2 font-mono font-bold text-[#89b4fa]">{p.port}</td>
                      <td className="py-2 font-semibold text-[#a6e3a1] text-[10px]">{p.proto}</td>
                      <td className="py-2 font-mono text-[#6c7086] truncate max-w-[120px]" title={p.address}>
                        {p.address}
                      </td>
                      <td className="py-2 font-semibold text-[#cdd6f4]" title={`PID: ${p.pid}`}>
                        {p.processName} <span className="font-mono text-[#585b70] text-[10px]">({p.pid})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Network Interfaces */}
      {sysInfo.network_ifaces && sysInfo.network_ifaces.length > 0 && (
        <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
            Network Interfaces
            <span className="ml-auto text-[10px] font-mono text-[#585b70] normal-case tracking-normal font-normal">
              Public IP: <span className="text-[#cdd6f4]">{sysInfo.public_ip || '...'}</span>
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(sysInfo.network_ifaces as NetworkIface[]).map((iface) => (
              <div key={iface.name} className="bg-[#11111b] border border-white/[0.04] rounded-xl p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${iface.state === 'UP' ? 'bg-[#a6e3a1]' : 'bg-[#45475a]'}`} />
                    <span className="font-mono text-xs font-bold text-[#cdd6f4]">{iface.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                        iface.type === 'vpn'
                          ? 'bg-[#cba6f7]/10 text-[#cba6f7]'
                          : iface.type === 'loopback'
                          ? 'bg-[#585b70]/20 text-[#585b70]'
                          : 'bg-[#89b4fa]/10 text-[#89b4fa]'
                      }`}
                    >
                      {iface.type}
                    </span>
                    <span className={`text-[9px] font-bold ${iface.state === 'UP' ? 'text-[#a6e3a1]' : 'text-[#585b70]'}`}>{iface.state}</span>
                  </div>
                </div>
                {iface.mac && <div className="font-mono text-[9px] text-[#45475a]">{iface.mac}</div>}
                {iface.ipv4.map((ip: string) => (
                  <div key={ip} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-[#f9e2af] bg-[#f9e2af]/10 px-1 rounded shrink-0">v4</span>
                    <span className="font-mono text-[10px] text-[#cdd6f4] select-text">{ip}</span>
                  </div>
                ))}
                {iface.ipv6.map((ip: string) => (
                  <div key={ip} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-[#89b4fa] bg-[#89b4fa]/10 px-1 rounded shrink-0">v6</span>
                    <span className="font-mono text-[9px] text-[#6c7086] break-all select-text">{ip}</span>
                  </div>
                ))}
                {iface.ipv4.length === 0 && iface.ipv6.length === 0 && <div className="text-[10px] text-[#45475a] italic">Không có địa chỉ IP</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
