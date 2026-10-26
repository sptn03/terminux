import { useState, useEffect } from 'react'
import { Send, RefreshCw } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'

interface MultiExecPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function MultiExecPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: MultiExecPanelProps) {
  const [multiCmd, setMultiCmd] = useState('')
  const [selectedSessions, setSelectedSessions] = useState<Record<string, boolean>>({})
  const [running, setRunning] = useState(false)
  const [multiOutputs, setMultiOutputs] = useState<
    Record<
      string,
      { label: string; output: string; status: 'idle' | 'running' | 'done' | 'error' }
    >
  >({})

  const tabs = useTerminalStore((s) => s.tabs)
  const otherTabs = tabs.filter((t) => t.connected && t.sessionId !== sessionId)

  // Dashboard Refresh clears previous cluster output.
  useEffect(() => {
    setMultiOutputs({})
  }, [refreshKey])

  const labelFor = (id: string): string =>
    id === sessionId ? 'Máy chủ hiện tại (Local)' : tabs.find((t) => t.sessionId === id)?.label || id

  const handleBroadcast = async () => {
    const command = multiCmd.trim()
    if (!command) return alert('Vui lòng nhập lệnh cần chạy!')

    const targetIds = Array.from(
      new Set([sessionId, ...Object.keys(selectedSessions).filter((id) => selectedSessions[id])])
    )

    const freshOutputs: typeof multiOutputs = {}
    for (const id of targetIds) {
      freshOutputs[id] = { label: labelFor(id), output: '', status: 'running' }
    }
    setMultiOutputs(freshOutputs)
    setRunning(true)
    setLoading(true)
    setError('')

    await Promise.all(
      targetIds.map(async (id) => {
        try {
          // Lệnh trên máy chủ hiện tại đi qua prop `exec`, các máy chủ khác gọi trực tiếp.
          const result = id === sessionId ? await exec(command) : await window.api.ssh.exec(id, command)
          const output = result.stdout || result.stderr || '(lệnh không trả về nội dung)'
          setMultiOutputs((prev) => ({
            ...prev,
            [id]: {
              label: labelFor(id),
              output: result.code === 0 ? output : `${output}\n[exit code: ${result.code}]`,
              status: result.code === 0 ? 'done' : 'error'
            }
          }))
        } catch (err: any) {
          setMultiOutputs((prev) => ({
            ...prev,
            [id]: { label: labelFor(id), output: 'Lỗi thực thi: ' + err.message, status: 'error' }
          }))
        }
      })
    )

    setRunning(false)
    setLoading(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4">
      <div className="grid grid-cols-4 gap-4 flex-1 overflow-hidden">
        {/* Sidebar: Server select */}
        <div className="col-span-1 bg-[#181825] border border-white/[0.04] rounded-xl p-3 flex flex-col overflow-hidden">
          <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-2">Chọn Server đích</span>
          <div className="flex-1 overflow-y-auto space-y-2">
            {otherTabs.map((t) => (
              <label
                key={t.sessionId}
                className="flex items-center gap-2 p-2 bg-[#11111b] border border-white/5 rounded-lg text-xs hover:bg-white/[0.02] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!selectedSessions[t.sessionId]}
                  onChange={(e) => {
                    setSelectedSessions((prev) => ({ ...prev, [t.sessionId]: e.target.checked }))
                  }}
                  className="rounded text-[#89b4fa] focus:ring-0 bg-[#1e1e2e] border-white/5"
                />
                <span className="truncate text-[#cdd6f4] font-semibold">{t.label}</span>
              </label>
            ))}
            {otherTabs.length === 0 && (
              <div className="text-[10px] text-[#585b70] italic text-center py-8">
                Không có tab SSH nào khác đang mở. Hãy mở thêm kết nối để chạy cluster.
              </div>
            )}
          </div>
        </div>

        {/* Console display outputs */}
        <div className="col-span-3 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative p-3">
          <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-2">Kết quả thực thi Cluster</span>
          <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto pr-1">
            {/* Current session output */}
            <div className="bg-[#181825] border border-white/5 rounded-lg p-2.5 flex flex-col overflow-hidden max-h-[250px]">
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="font-bold text-[#89b4fa]">Máy chủ hiện tại (Local)</span>
                <span
                  className={`font-mono text-[9px] px-1 py-0.5 rounded ${
                    multiOutputs[sessionId]?.status === 'running'
                      ? 'bg-yellow-500/10 text-yellow-500 animate-pulse'
                      : multiOutputs[sessionId]?.status === 'done'
                      ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                      : 'text-[#585b70]'
                  }`}
                >
                  {multiOutputs[sessionId]?.status || 'idle'}
                </span>
              </div>
              <pre className="flex-1 font-mono text-[9px] overflow-auto whitespace-pre-wrap select-text bg-[#11111b] p-1.5 rounded border border-white/[0.02]">
                {multiOutputs[sessionId]?.output || 'Chưa chạy lệnh nào.'}
              </pre>
            </div>

            {/* Selected target sessions outputs */}
            {Object.keys(selectedSessions)
              .filter((id) => selectedSessions[id])
              .map((id) => {
                const sessionInfo = tabs.find((t) => t.sessionId === id)
                return (
                  <div key={id} className="bg-[#181825] border border-white/5 rounded-lg p-2.5 flex flex-col overflow-hidden max-h-[250px]">
                    <div className="flex justify-between items-center mb-1 text-[10px]">
                      <span className="font-bold text-[#a6e3a1] truncate max-w-[120px]">
                        {multiOutputs[id]?.label || sessionInfo?.label || 'Server'}
                      </span>
                      <span
                        className={`font-mono text-[9px] px-1 py-0.5 rounded ${
                          multiOutputs[id]?.status === 'running'
                            ? 'bg-yellow-500/10 text-yellow-500 animate-pulse'
                            : multiOutputs[id]?.status === 'done'
                            ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                            : 'text-[#585b70]'
                        }`}
                      >
                        {multiOutputs[id]?.status || 'idle'}
                      </span>
                    </div>
                    <pre className="flex-1 font-mono text-[9px] overflow-auto whitespace-pre-wrap select-text bg-[#11111b] p-1.5 rounded border border-white/[0.02]">
                      {multiOutputs[id]?.output || 'Chưa chạy lệnh nào.'}
                    </pre>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 flex gap-3 items-center shrink-0">
        <input
          type="text"
          placeholder="Nhập lệnh thực thi cluster (ví dụ: df -h, uname -a, free -m)..."
          value={multiCmd}
          onChange={(e) => setMultiCmd(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              await handleBroadcast()
            }
          }}
          className="flex-1 bg-[#11111b] border border-white/5 rounded-lg px-4 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
        />
        <button
          onClick={handleBroadcast}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all flex items-center gap-1.5 disabled:opacity-40"
        >
          {running ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
          {running ? 'Đang chạy...' : 'Broadcast'}
        </button>
      </div>
    </div>
  )
}
