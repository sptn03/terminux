import { useState, useEffect, useCallback } from 'react'
import { Plus, Terminal } from 'lucide-react'

interface LogsPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export default function LogsPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: LogsPanelProps) {
  const [logPaths, setLogPaths] = useState<string[]>([
    '/var/log/nginx/access.log',
    '/var/log/nginx/error.log',
    '/var/log/syslog'
  ])
  const [selectedLogPath, setSelectedLogPath] = useState<string>('/var/log/nginx/access.log')
  const [logContent, setLogContent] = useState<string>('')
  const [logSearch, setLogSearch] = useState<string>('')
  const [logAutoRefresh, setLogAutoRefresh] = useState<boolean>(true)
  const [newLogPathInput, setNewLogPathInput] = useState<string>('')
  const [showAddLogInput, setShowAddLogInput] = useState<boolean>(false)

  const fetchLogsContent = useCallback(async () => {
    if (!selectedLogPath) return
    try {
      const { stdout, stderr } = await exec(`tail -n 100 "${selectedLogPath}" 2>&1`)
      setLogContent(stripAnsi(stdout || stderr || 'Không tìm thấy log hoặc file trống.'))
    } catch (e: any) {
      setError(e.message || 'Lỗi tải log file')
    }
  }, [exec, selectedLogPath, setError])

  const handleAddLogPath = () => {
    const trimmed = newLogPathInput.trim()
    if (trimmed && !logPaths.includes(trimmed)) {
      setLogPaths([...logPaths, trimmed])
      setSelectedLogPath(trimmed)
      setNewLogPathInput('')
      setShowAddLogInput(false)
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchLogsContent()
    setLoading(false)
  }, [fetchLogsContent, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    if (logAutoRefresh) {
      const interval = setInterval(fetchLogsContent, 3000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [logAutoRefresh, fetchLogsContent])

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Left Files List */}
      <div className="w-64 min-w-64 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        <div className="px-3 py-2 bg-[#11111b]/50 border-b border-white/[0.04] flex items-center justify-between text-[10px] font-semibold text-[#585b70] uppercase tracking-wider">
          <span>Log Files</span>
          <button
            onClick={() => setShowAddLogInput(!showAddLogInput)}
            className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
            title="Thêm file log"
          >
            <Plus size={11} />
          </button>
        </div>

        {showAddLogInput && (
          <div className="p-2 border-b border-white/[0.04] bg-[#11111b]/35 space-y-1.5">
            <input
              type="text"
              placeholder="Đường dẫn log file..."
              value={newLogPathInput}
              onChange={(e) => setNewLogPathInput(e.target.value)}
              className="w-full bg-[#1e1e2e] border border-white/5 rounded-md px-2 py-1 text-xs text-[#cdd6f4] outline-none"
            />
            <div className="flex gap-1 justify-end">
              <button onClick={() => setShowAddLogInput(false)} className="px-2 py-0.5 rounded text-[9px] bg-white/5 hover:bg-white/10">
                Hủy
              </button>
              <button onClick={handleAddLogPath} className="px-2 py-0.5 rounded text-[9px] bg-[#89b4fa] text-[#1e1e2e] font-semibold">
                Thêm
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {logPaths.map((path) => (
            <button
              key={path}
              onClick={() => setSelectedLogPath(path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-all ${
                selectedLogPath === path ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#a6adc8] hover:bg-white/[0.02]'
              }`}
            >
              <Terminal size={12} className="shrink-0 text-[#89b4fa]" />
              <span className="truncate block flex-1" title={path}>
                {path.substring(path.lastIndexOf('/') + 1)}
              </span>
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-white/[0.04] bg-[#11111b]/35 flex justify-between items-center text-[10px] text-[#585b70]">
          <span>Tự động cập nhật (3s)</span>
          <input
            type="checkbox"
            checked={logAutoRefresh}
            onChange={(e) => setLogAutoRefresh(e.target.checked)}
            className="rounded bg-[#1e1e2e] border-white/5"
          />
        </div>
      </div>

      {/* Right Log Console */}
      <div className="flex-1 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative">
        {/* Header / Filter */}
        <div className="px-4 py-2 border-b border-white/[0.04] bg-[#181825]/50 flex items-center gap-4">
          <span className="font-mono text-xs text-[#a6adc8] truncate flex-1">{selectedLogPath}</span>
          <input
            type="text"
            placeholder="Lọc từ khóa logs..."
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="w-48 bg-[#1e1e2e] border border-white/5 rounded-md px-2 py-1 text-xs text-[#cdd6f4] outline-none"
          />
        </div>

        {/* Console display */}
        <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed select-text scrollbar-thin">
          {(() => {
            const filteredLines = logContent.split('\n').filter((line) => line.toLowerCase().includes(logSearch.toLowerCase()))

            if (filteredLines.length === 0) {
              return <div className="text-[#585b70] text-center py-10">Không tìm thấy log nào khớp với từ khóa.</div>
            }

            return filteredLines.map((line, idx) => {
              let colorClass = 'text-[#bac2de]'
              const lowerLine = line.toLowerCase()
              if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes(' 500 ')) {
                colorClass = 'text-[#f38ba8] font-bold'
              } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
                colorClass = 'text-[#f9e2af]'
              } else if (lowerLine.includes('success') || lowerLine.includes(' 200 ') || lowerLine.includes(' 201 ')) {
                colorClass = 'text-[#a6e3a1]'
              }

              return (
                <div key={idx} className={`${colorClass} whitespace-pre-wrap py-0.5 hover:bg-white/[0.02]`}>
                  {line}
                </div>
              )
            })
          })()}
        </div>
      </div>
    </div>
  )
}
