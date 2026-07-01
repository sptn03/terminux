import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Play } from 'lucide-react'

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, dom, mon, dow] = parts

  // Common presets
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Mỗi phút'
  if (min.startsWith('*/')) return `Mỗi ${min.replace('*/', '')} phút`
  if (min !== '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Phút ${min} mỗi giờ`
  if (hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') return `Mỗi ${hour.replace('*/', '')} giờ, phút ${min}`
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') return `Hàng ngày lúc ${hour}:${min.padStart(2, '0')}`
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow !== '*') {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    const dayName = days[parseInt(dow)] || dow
    return `Mỗi ${dayName} lúc ${hour}:${min.padStart(2, '0')}`
  }
  if (min !== '*' && hour !== '*' && dom !== '*' && mon === '*') return `Ngày ${dom} hàng tháng lúc ${hour}:${min.padStart(2, '0')}`
  return expr
}

function sanitizeForShell(str: string): string {
  // Escape shell special chars to prevent injection
  return str.replace(/["$`\\!]/g, '\\$&')
}

interface CronPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function CronPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: CronPanelProps) {
  const [cronJobs, setCronJobs] = useState<string[]>([])
  const [showAddCronModal, setShowAddCronModal] = useState(false)
  const [cronCommand, setCronCommand] = useState('')
  const [cronSchedule, setCronSchedule] = useState('* * * * *')
  const [cronLogs, setCronLogs] = useState<string | null>(null)
  const [editingCronIndex, setEditingCronIndex] = useState<number | null>(null)

  const fetchCronJobs = useCallback(async () => {
    try {
      const { stdout } = await exec("crontab -l 2>/dev/null || echo ''")
      const jobs = stdout.split('\n').filter(Boolean)
      setCronJobs(jobs)
    } catch (e: any) {
      setError(e.message || 'Lỗi tải danh sách cron jobs')
    }
  }, [exec, setError])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchCronJobs()
    setLoading(false)
  }, [fetchCronJobs, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-[#a6adc8] font-semibold">Tác vụ định kỳ (crontab)</span>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setLoading(true)
              const { stdout } = await exec(
                "sudo grep CRON /var/log/syslog | tail -n 50 || tail -n 50 /var/log/cron 2>/dev/null || echo 'Không có quyền truy cập log file (Yêu cầu quyền sudo)'"
              )
              setCronLogs(stdout)
              setLoading(false)
            }}
            className="px-3 py-1 rounded bg-[#fab387] text-[#1e1e2e] text-xs font-semibold hover:bg-[#f8a060] transition-all"
          >
            Xem Cron Logs
          </button>
          <button
            onClick={() => {
              setCronCommand('')
              setCronSchedule('* * * * *')
              setEditingCronIndex(null)
              setShowAddCronModal(true)
            }}
            className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] text-xs font-semibold hover:bg-[#74c7ec] transition-all flex items-center gap-1"
          >
            <Plus size={13} /> Thêm Cron Job
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
        {cronJobs.length === 0 ? (
          <div className="text-center text-[#585b70] text-xs py-12">Không có cron job nào được cấu hình.</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                <th className="p-3 w-12">Trạng thái</th>
                <th className="p-3">Thời gian</th>
                <th className="p-3">Mô tả</th>
                <th className="p-3">Lệnh thực thi</th>
                <th className="p-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {cronJobs.map((job, idx) => {
                const isCommented = job.startsWith('#')
                const cleanJob = job.replace(/^#\s*/, '').trim()
                const parts = cleanJob.split(/\s+/)
                const schedule = parts.slice(0, 5).join(' ')
                const command = parts.slice(5).join(' ')

                return (
                  <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                          isCommented ? 'bg-[#585b70]/20 text-[#585b70]' : 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                        }`}
                      >
                        {isCommented ? 'Tắt' : 'Bật'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-[#89b4fa] text-[10px]" title={schedule}>{schedule}</td>
                    <td className="p-3 text-[#a6adc8] text-[10px]">{describeCron(schedule)}</td>
                    <td className="p-3 font-mono text-[#cdd6f4] break-all select-text">{command}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={async () => {
                            setLoading(true)
                            const updatedJobs = [...cronJobs]
                            if (isCommented) {
                              updatedJobs[idx] = cleanJob
                            } else {
                              updatedJobs[idx] = `# ${job}`
                            }
                            const newCronString = sanitizeForShell(updatedJobs.join('\n'))
                            await exec(`echo "${newCronString}" | crontab -`)
                            await fetchCronJobs()
                            setLoading(false)
                          }}
                          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-xs transition-all animate-none text-[#a6adc8]"
                        >
                          {isCommented ? 'Bật' : 'Tắt'}
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Chạy thử lệnh ngay bây giờ?\n${command}`)) {
                              setLoading(true)
                              const result = await exec(command)
                              setCronLogs(result.stdout || result.stderr || 'Lệnh hoàn tất (không có output).')
                              setLoading(false)
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-[#a6e3a1]/10 text-[#a6e3a1] hover:bg-[#a6e3a1]/20 text-xs transition-all"
                          title="Chạy lệnh ngay lập tức"
                        >
                          <Play size={10} className="inline" /> Run
                        </button>
                        <button
                          onClick={() => {
                            setCronSchedule(schedule)
                            setCronCommand(command)
                            setEditingCronIndex(idx)
                            setShowAddCronModal(true)
                          }}
                          className="px-2 py-0.5 rounded bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 text-xs transition-all"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm('Xóa cron job này?')) {
                              setLoading(true)
                              const updatedJobs = cronJobs.filter((_, i) => i !== idx)
                              const newCronString = sanitizeForShell(updatedJobs.join('\n'))
                              await exec(`echo "${newCronString}" | crontab -`)
                              await fetchCronJobs()
                              setLoading(false)
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 text-xs transition-all"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Cron Modal */}
      {showAddCronModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddCronModal(false)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                {editingCronIndex !== null ? 'Chỉnh sửa Cron Job' : 'Tạo mới Cron Job'}
              </h3>
              <button onClick={() => setShowAddCronModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Thời gian (Cron Expression)</label>
                <input
                  type="text"
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  placeholder="* * * * *"
                />
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-[9px] text-[#585b70]">
                  <button
                    onClick={() => setCronSchedule('*/1 * * * *')}
                    className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]"
                  >
                    Mỗi phút (*/1 * * * *)
                  </button>
                  <button onClick={() => setCronSchedule('0 * * * *')} className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]">
                    Mỗi giờ (0 * * * *)
                  </button>
                  <button
                    onClick={() => setCronSchedule('0 0 * * *')}
                    className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]"
                  >
                    Mỗi ngày (0 0 * * *)
                  </button>
                  <button
                    onClick={() => setCronSchedule('0 0 * * 0')}
                    className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]"
                  >
                    Mỗi tuần (0 0 * * 0)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Lệnh thực thi (Command)</label>
                <input
                  type="text"
                  value={cronCommand}
                  onChange={(e) => setCronCommand(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  placeholder="/path/to/script.sh"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCronModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true)
                    const newJob = `${cronSchedule} ${cronCommand}`
                    let updatedJobs = [...cronJobs]
                    if (editingCronIndex !== null) {
                      updatedJobs[editingCronIndex] = newJob
                    } else {
                      updatedJobs.push(newJob)
                    }
                    const newCronString = sanitizeForShell(updatedJobs.join('\n'))
                    await exec(`echo "${newCronString}" | crontab -`)
                    await fetchCronJobs()
                    setShowAddCronModal(false)
                    setLoading(false)
                  }}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  {editingCronIndex !== null ? 'Lưu thay đổi' : 'Tạo mới'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cron Logs View Modal */}
      {cronLogs !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCronLogs(null)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Cron Execution Logs</h3>
              <button onClick={() => setCronLogs(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
              {cronLogs || 'Không tìm thấy nhật ký hoạt động của Cron.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
