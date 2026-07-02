import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldAlert, ShieldOff, Plus, Trash2, RefreshCw, Power, X } from 'lucide-react'

interface FirewallRule {
  num: string
  to: string
  action: string
  from: string
}

interface FirewallPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function FirewallPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: FirewallPanelProps) {
  const [installed, setInstalled] = useState(true)
  const [active, setActive] = useState(false)
  const [rules, setRules] = useState<FirewallRule[]>([])
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPort, setNewPort] = useState('')
  const [newProto, setNewProto] = useState<'tcp' | 'udp' | 'both'>('tcp')
  const [newAction, setNewAction] = useState<'allow' | 'deny'>('allow')
  const [newSource, setNewSource] = useState('any')
  const [adding, setAdding] = useState(false)
  const [ufwLogs, setUfwLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  const fetchUfwLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const cmd = `sudo tail -n 50 /var/log/ufw.log 2>/dev/null || tail -n 50 /var/log/ufw.log 2>/dev/null || dmesg | grep -i ufw | tail -n 50 2>/dev/null || echo "Không tìm thấy file log UFW hoặc không đủ quyền đọc."`
      const { stdout } = await exec(cmd)
      setUfwLogs(stdout.trim() || 'Không có nhật ký chặn/mở gói tin UFW gần đây.')
    } catch {
      setUfwLogs('Lỗi đọc nhật ký UFW.')
    }
    setLoadingLogs(false)
  }, [exec])

  const fetchFirewall = useCallback(async () => {
    try {
      const checkUfw = await exec('which ufw 2>/dev/null')
      if (checkUfw.code !== 0) {
        setInstalled(false)
        return
      }
      setInstalled(true)

      const statusRes = await exec('sudo ufw status numbered')
      if (statusRes.code !== 0) {
        setError(statusRes.stderr || 'Không thể chạy ufw status. Kiểm tra quyền sudo.')
        return
      }

      const stdout = statusRes.stdout
      if (stdout.includes('Status: inactive')) {
        setActive(false)
        setRules([])
        return
      }

      setActive(true)
      fetchUfwLogs()
      const lines = stdout.split('\n')
      const parsedRules: FirewallRule[] = []

      // Match format: [ 1] 22/tcp                     ALLOW IN    Anywhere
      const ruleRegex = /^\[\s*(\d+)\]\s+(\S+)\s+([a-zA-Z\s]+?)(?:\s+IN|\s+OUT)?\s+(.+)$/

      lines.forEach((line) => {
        const cleanLine = line.trim()
        const match = cleanLine.match(ruleRegex)
        if (match) {
          parsedRules.push({
            num: match[1],
            to: match[2],
            action: match[3].trim(),
            from: match[4].trim()
          })
        }
      })

      setRules(parsedRules)
    } catch (e: any) {
      setError(e.message || 'Lỗi tải tường lửa.')
    }
  }, [exec, setError])

  const handleToggleFirewall = async () => {
    setLoading(true)
    try {
      if (active) {
        const res = await exec('sudo ufw disable')
        if (res.code === 0) {
          alert('Đã tắt tường lửa UFW.')
        } else {
          alert('Lỗi: ' + res.stderr)
        }
      } else {
        const res = await exec('echo "y" | sudo ufw enable')
        if (res.code === 0) {
          alert('Đã kích hoạt tường lửa UFW.')
        } else {
          alert('Lỗi: ' + res.stderr)
        }
      }
      await fetchFirewall()
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRule = async (num: string, to: string) => {
    if (!confirm(`Bạn có chắc muốn xóa Rule #${num} (${to})?`)) return
    setLoading(true)
    try {
      const res = await exec(`sudo ufw --force delete ${num}`)
      if (res.code === 0) {
        alert(`Đã xóa rule #${num} thành công.`)
        await fetchFirewall()
      } else {
        alert('Lỗi: ' + res.stderr)
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRule = async () => {
    if (!newPort.trim()) {
      alert('Vui lòng nhập cổng (Port)!')
      return
    }

    setAdding(true)
    try {
      let cmd = `sudo ufw ${newAction}`
      
      const protoPart = newProto === 'both' ? '' : `/${newProto}`
      const srcPart = newSource.trim() && newSource.trim() !== 'any' ? ` from ${newSource.trim()}` : ''
      const portPart = srcPart ? ` to any port ${newPort.trim()}` : ` ${newPort.trim()}${protoPart}`

      cmd = `${cmd}${srcPart}${portPart}`

      const res = await exec(cmd)
      if (res.code === 0) {
        alert('Đã thêm Rule tường lửa thành công!')
        setShowAddModal(false)
        setNewPort('')
        setNewSource('any')
        await fetchFirewall()
      } else {
        alert('Lỗi: ' + res.stderr)
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchFirewall().finally(() => setLoading(false))
  }, [fetchFirewall, refreshKey])

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {!installed ? (
        <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-md mx-auto p-6 text-center space-y-4">
          <ShieldAlert size={48} className="text-[#f38ba8] opacity-60 animate-bounce" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#cdd6f4]">UFW chưa được cài đặt</h3>
            <p className="text-xs text-[#585b70]">
              Không tìm thấy lệnh ufw trên máy chủ SSH này. Vui lòng cài đặt ufw bằng lệnh <code className="text-[#89b4fa]">sudo apt-get install ufw</code>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-4 bg-[#181825] border border-white/[0.04] p-3 rounded-xl shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${active ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'}`}>
                <Shield size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#cdd6f4]">Trạng thái Tường lửa (UFW)</h4>
                <span className="text-[10px] font-semibold text-[#585b70]">
                  {active ? 'Đang hoạt động (Kích hoạt)' : 'Đang tắt (Chưa hoạt động)'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleToggleFirewall}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20'
                    : 'bg-[#a6e3a1]/10 text-[#a6e3a1] hover:bg-[#a6e3a1]/20'
                }`}
              >
                <Power size={12} />
                {active ? 'Tắt Firewall' : 'Bật Firewall'}
              </button>
              {active && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all flex items-center gap-1"
                >
                  <Plus size={13} /> Thêm Rule
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              {!active ? (
                <div className="flex flex-col items-center justify-center text-[#585b70] py-16 space-y-2">
                  <ShieldOff size={36} className="opacity-30" />
                  <span className="text-xs font-semibold">Tường lửa đang tắt</span>
                  <span className="text-[10px] text-[#45475a] max-w-xs text-center leading-relaxed">
                    Hãy kích hoạt UFW ở nút phía trên để bắt đầu cấu hình quy tắc lọc gói tin cho server.
                  </span>
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center text-[#585b70] text-xs py-12">Chưa cấu hình rule tường lửa nào.</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Cổng (To Port)</th>
                      <th className="p-3">Hành động (Action)</th>
                      <th className="p-3">Địa chỉ nguồn (From Source)</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.num} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                        <td className="p-3 text-center font-mono text-[#6c7086]">{r.num}</td>
                        <td className="p-3 font-mono font-bold text-[#89b4fa]">{r.to}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              r.action.toLowerCase().includes('allow')
                                ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                                : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                            }`}
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[#a6adc8]">{r.from}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteRule(r.num, r.to)}
                            className="p-1 rounded hover:bg-white/5 text-[#f38ba8] transition-all"
                            title="Xóa Rule"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {active && (
              <div className="h-44 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-3.5 shrink-0">
                <div className="flex justify-between items-center mb-1.5 shrink-0">
                  <span className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider">Nhật ký Tường lửa (UFW Logs)</span>
                  <button
                    onClick={fetchUfwLogs}
                    className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all"
                    title="Tải lại logs"
                  >
                    <RefreshCw size={11} className={loadingLogs ? 'animate-spin' : ''} />
                  </button>
                </div>
                <pre className="flex-1 overflow-y-auto font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap select-text bg-[#11111b] p-3 rounded-lg border border-white/[0.02] scrollbar-thin">
                  {ufwLogs || 'Không có bản ghi nhật ký nào.'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false)
          }}
        >
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Thêm Quy tắc Tường lửa
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Cổng mạng (Port) *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="ví dụ: 8080, 3000:3010"
                  value={newPort}
                  onChange={(e) => setNewPort(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                  disabled={adding}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Giao thức (Protocol)</label>
                <select
                  value={newProto}
                  onChange={(e) => setNewProto(e.target.value as any)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  disabled={adding}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="both">Cả hai (TCP/UDP)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Hành động (Action)</label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as any)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  disabled={adding}
                >
                  <option value="allow">Cho phép (ALLOW)</option>
                  <option value="deny">Chặn (DENY)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Địa chỉ IP nguồn (Source IP)</label>
                <input
                  type="text"
                  placeholder="any hoặc địa chỉ IP cụ thể (ví dụ: 192.168.1.100)"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                  disabled={adding}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                  disabled={adding}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={adding}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {adding ? 'Đang thêm...' : 'Thêm Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
