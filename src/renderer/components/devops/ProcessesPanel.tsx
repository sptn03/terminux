import { useState, useEffect, useCallback, useMemo } from 'react'

interface ProcessesPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface ProcessInfo {
  pid: string
  user: string
  cpu: number
  mem: number
  time: string
  command: string
}

export default function ProcessesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: ProcessesPanelProps) {
  const [processList, setProcessList] = useState<ProcessInfo[]>([])
  const [procSearch, setProcSearch] = useState('')
  const [procSortKey, setProcSortKey] = useState<'cpu' | 'mem' | 'pid'>('cpu')
  const [filterUser, setFilterUser] = useState<string>('__all__')

  const fetchProcesses = useCallback(async () => {
    try {
      const { stdout } = await exec("ps -eo pid,user,%cpu,%mem,time,comm --sort=-%cpu | head -n 50")
      if (!stdout) return
      const lines = stdout.split('\n').slice(1) // skip header
      const procs: ProcessInfo[] = lines
        .map((line) => {
          const parts = line.trim().replace(/\s+/g, ' ').split(' ')
          if (parts.length < 6) return null
          return {
            pid: parts[0],
            user: parts[1],
            cpu: parseFloat(parts[2]) || 0,
            mem: parseFloat(parts[3]) || 0,
            time: parts[4],
            command: parts.slice(5).join(' ')
          }
        })
        .filter(Boolean) as ProcessInfo[]
      setProcessList(procs)
    } catch (e: any) {
      setError(e.message || 'Lỗi tải danh sách tiến trình')
    }
  }, [exec, setError])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchProcesses()
    setLoading(false)
  }, [fetchProcesses, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const interval = setInterval(fetchProcesses, 4000)
    return () => clearInterval(interval)
  }, [fetchProcesses])

  const uniqueUsers = useMemo(() => {
    const users = new Set(processList.map((p) => p.user))
    return Array.from(users).sort()
  }, [processList])

  const filtered = useMemo(() => {
    return processList
      .filter((p) => {
        if (filterUser !== '__all__' && p.user !== filterUser) return false
        if (procSearch && !p.command.toLowerCase().includes(procSearch.toLowerCase()) && !p.pid.includes(procSearch)) return false
        return true
      })
      .sort((a, b) => {
        if (procSortKey === 'cpu') return b.cpu - a.cpu
        if (procSortKey === 'mem') return b.mem - a.mem
        return parseInt(b.pid) - parseInt(a.pid)
      })
  }, [processList, filterUser, procSearch, procSortKey])

  const stats = useMemo(() => {
    const totalCpu = filtered.reduce((s, p) => s + p.cpu, 0)
    const totalMem = filtered.reduce((s, p) => s + p.mem, 0)
    return { count: filtered.length, totalCpu, totalMem }
  }, [filtered])

  const handleSignal = async (pid: string, signal: string) => {
    const signalMap: Record<string, string> = {
      SIGTERM: '15', SIGKILL: '9', SIGHUP: '1', SIGUSR1: '10', SIGUSR2: '12'
    }
    const sigNum = signalMap[signal] || '15'
    if (confirm(`Gửi ${signal} tới tiến trình PID ${pid}?`)) {
      setLoading(true)
      await exec(`kill -${sigNum} ${pid} || sudo kill -${sigNum} ${pid}`)
      await fetchProcesses()
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div className="flex gap-2 items-center flex-1 min-w-0">
          <input
            type="text"
            placeholder="Tìm kiếm tiến trình (tên, PID)..."
            value={procSearch}
            onChange={(e) => setProcSearch(e.target.value)}
            className="bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none w-56"
          />
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-[#181825] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-[#cdd6f4] outline-none"
          >
            <option value="__all__">Tất cả Users</option>
            {uniqueUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 text-xs items-center">
          <span className="text-[#585b70]">Sắp xếp:</span>
          <button
            onClick={() => setProcSortKey('cpu')}
            className={`px-2 py-0.5 rounded ${procSortKey === 'cpu' ? 'bg-[#89b4fa]/15 text-[#89b4fa]' : 'text-[#a6adc8]'}`}
          >
            CPU%
          </button>
          <button
            onClick={() => setProcSortKey('mem')}
            className={`px-2 py-0.5 rounded ${procSortKey === 'mem' ? 'bg-[#89b4fa]/15 text-[#89b4fa]' : 'text-[#a6adc8]'}`}
          >
            RAM%
          </button>
          <button
            onClick={() => setProcSortKey('pid')}
            className={`px-2 py-0.5 rounded ${procSortKey === 'pid' ? 'bg-[#89b4fa]/15 text-[#89b4fa]' : 'text-[#a6adc8]'}`}
          >
            PID
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-[#181825] border border-white/[0.04] rounded-lg px-4 py-2 mb-3 flex gap-6 text-xs shrink-0">
        <span className="text-[#585b70]">Tổng: <span className="font-bold text-[#cdd6f4]">{stats.count}</span> tiến trình</span>
        <span className="text-[#585b70]">CPU tổng: <span className="font-bold text-[#a6e3a1]">{stats.totalCpu.toFixed(1)}%</span></span>
        <span className="text-[#585b70]">RAM tổng: <span className="font-bold text-[#f9e2af]">{stats.totalMem.toFixed(1)}%</span></span>
      </div>

      <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
              <th className="p-3">PID</th>
              <th className="p-3">User</th>
              <th className="p-3 text-right">CPU %</th>
              <th className="p-3 text-right">MEM %</th>
              <th className="p-3">Time</th>
              <th className="p-3">Command</th>
              <th className="p-3 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.pid} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-mono text-[#89b4fa] font-bold">{p.pid}</td>
                <td className="p-3 text-[#a6adc8]">{p.user}</td>
                <td className="p-3 text-right font-mono text-[#a6e3a1]">{p.cpu}%</td>
                <td className="p-3 text-right font-mono text-[#f9e2af]">{p.mem}%</td>
                <td className="p-3 font-mono text-[#6c7086]">{p.time}</td>
                <td className="p-3 font-mono text-[#cdd6f4] max-w-xs truncate" title={p.command}>
                  {p.command}
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-center">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSignal(p.pid, e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="bg-[#11111b] border border-white/5 rounded px-1.5 py-0.5 text-[10px] text-[#cdd6f4] outline-none cursor-pointer"
                    >
                      <option value="" disabled>Signal...</option>
                      <option value="SIGTERM">SIGTERM (15)</option>
                      <option value="SIGKILL">SIGKILL (9)</option>
                      <option value="SIGHUP">SIGHUP (1)</option>
                      <option value="SIGUSR1">SIGUSR1 (10)</option>
                      <option value="SIGUSR2">SIGUSR2 (12)</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
