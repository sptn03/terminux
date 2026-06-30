import { useState, useEffect, useCallback } from 'react'

interface ProcessesPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function ProcessesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: ProcessesPanelProps) {
  const [processList, setProcessList] = useState<any[]>([])
  const [procSearch, setProcSearch] = useState('')
  const [procSortKey, setProcSortKey] = useState<'cpu' | 'mem' | 'pid'>('cpu')

  const fetchProcesses = useCallback(async () => {
    try {
      const { stdout } = await exec("ps -eo pid,user,%cpu,%mem,time,comm --sort=-%cpu | head -n 40")
      if (!stdout) return
      const lines = stdout.split('\n').slice(1) // skip header
      const procs = lines
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
        .filter(Boolean)
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <input
          type="text"
          placeholder="Tìm kiếm tiến trình (tên, PID)..."
          value={procSearch}
          onChange={(e) => setProcSearch(e.target.value)}
          className="bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none w-64"
        />
        <div className="flex gap-2 text-xs">
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
            {processList
              .filter((p) => p.command.toLowerCase().includes(procSearch.toLowerCase()) || p.pid.includes(procSearch))
              .sort((a, b) => {
                if (procSortKey === 'cpu') return b.cpu - a.cpu
                if (procSortKey === 'mem') return b.mem - a.mem
                return parseInt(b.pid) - parseInt(a.pid)
              })
              .map((p) => (
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
                    <div className="flex gap-1.5 justify-center">
                      <button
                        onClick={async () => {
                          if (confirm(`Bạn có chắc muốn tắt tiến trình PID ${p.pid}?`)) {
                            setLoading(true)
                            await exec(`kill -15 ${p.pid} || sudo kill -15 ${p.pid}`)
                            await fetchProcesses()
                            setLoading(false)
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 transition-all text-[10px]"
                      >
                        Kill
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Buộc tắt tiến trình PID ${p.pid} (SIGKILL)?`)) {
                            setLoading(true)
                            await exec(`kill -9 ${p.pid} || sudo kill -9 ${p.pid}`)
                            await fetchProcesses()
                            setLoading(false)
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all text-[10px]"
                      >
                        Force Kill
                      </button>
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
