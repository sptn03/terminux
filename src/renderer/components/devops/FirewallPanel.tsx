import { useState, useEffect, useCallback } from 'react'
import { Shield, Plus, Trash2, X, Power } from 'lucide-react'

interface FirewallRule {
  number?: string
  to: string
  action: string
  from: string
  comment?: string
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
  const [firewallType, setFirewallType] = useState<'ufw' | 'iptables' | 'none'>('none')
  const [ufwStatus, setUfwStatus] = useState('')
  const [ufwEnabled, setUfwEnabled] = useState(false)
  const [rules, setRules] = useState<FirewallRule[]>([])
  const [showAddRuleModal, setShowAddRuleModal] = useState(false)
  const [newRuleAction, setNewRuleAction] = useState<'allow' | 'deny'>('allow')
  const [newRulePort, setNewRulePort] = useState('')
  const [newRuleFrom, setNewRuleFrom] = useState('any')
  const [newRuleProto, setNewRuleProto] = useState<'tcp' | 'udp' | 'any'>('any')

  const fetchFirewall = useCallback(async () => {
    try {
      // Check if UFW is available
      const ufwCheck = await exec('which ufw 2>/dev/null && echo "found" || echo "not_found"')
      if (ufwCheck.stdout.includes('found')) {
        setFirewallType('ufw')
        const { stdout } = await exec('sudo ufw status verbose 2>/dev/null || ufw status verbose 2>/dev/null || echo "inactive"')
        setUfwStatus(stdout)
        setUfwEnabled(stdout.includes('Status: active'))

        // Parse rules
        const ruleLines = stdout.split('\n')
        const parsedRules: FirewallRule[] = []
        let inRules = false
        ruleLines.forEach((line) => {
          if (line.includes('---')) { inRules = true; return }
          if (!inRules) return
          const trimmed = line.trim()
          if (!trimmed) return
          // Format: "22/tcp                     ALLOW IN    Anywhere"
          const parts = trimmed.replace(/\s+/g, ' ').split(' ')
          if (parts.length >= 3) {
            parsedRules.push({
              to: parts[0],
              action: parts[1] + (parts[2] === 'IN' || parts[2] === 'OUT' ? ' ' + parts[2] : ''),
              from: parts.slice(parts[2] === 'IN' || parts[2] === 'OUT' ? 3 : 2).join(' ') || 'Anywhere'
            })
          }
        })
        setRules(parsedRules)
      } else {
        // Try iptables
        const iptCheck = await exec('which iptables 2>/dev/null && echo "found" || echo "not_found"')
        if (iptCheck.stdout.includes('found')) {
          setFirewallType('iptables')
          const { stdout } = await exec('sudo iptables -L -n --line-numbers 2>/dev/null || echo "Không có quyền"')
          setUfwStatus(stdout)
          setUfwEnabled(true)
          // iptables parsing is complex, show raw output
          setRules([])
        } else {
          setFirewallType('none')
        }
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi kiểm tra firewall')
    }
  }, [exec, setError])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchFirewall()
    setLoading(false)
  }, [fetchFirewall, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleToggleUfw = async () => {
    if (ufwEnabled) {
      if (!confirm('Tắt firewall UFW? Tất cả rule sẽ bị vô hiệu hóa.')) return
      setLoading(true)
      await exec('sudo ufw disable')
    } else {
      if (!confirm('Bật firewall UFW? Đảm bảo SSH (port 22) được phép trước khi bật.')) return
      setLoading(true)
      await exec('echo "y" | sudo ufw enable')
    }
    await fetchFirewall()
    setLoading(false)
  }

  const handleAddRule = async () => {
    if (!newRulePort) return
    // Sanitize port input
    if (!/^[0-9:\/a-zA-Z]+$/.test(newRulePort)) {
      alert('Port không hợp lệ')
      return
    }
    setLoading(true)
    let cmd = `sudo ufw ${newRuleAction}`
    if (newRuleFrom !== 'any') {
      cmd += ` from ${newRuleFrom}`
    }
    cmd += ` to any port ${newRulePort}`
    if (newRuleProto !== 'any') {
      cmd += ` proto ${newRuleProto}`
    }
    await exec(cmd)
    await fetchFirewall()
    setShowAddRuleModal(false)
    setNewRulePort('')
    setNewRuleFrom('any')
    setLoading(false)
  }

  const handleDeleteRule = async (ruleIndex: number) => {
    if (!confirm(`Xóa rule #${ruleIndex + 1}?`)) return
    setLoading(true)
    await exec(`echo "y" | sudo ufw delete ${ruleIndex + 1}`)
    await fetchFirewall()
    setLoading(false)
  }

  const handleInstallUfw = async () => {
    setLoading(true)
    await exec('sudo apt-get install -y ufw || sudo yum install -y ufw')
    await fetchFirewall()
    setLoading(false)
  }

  if (firewallType === 'none') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
        <Shield size={48} className="mb-3 opacity-30" />
        <span className="text-xs font-semibold mb-3">Không tìm thấy UFW hoặc iptables trên server</span>
        <button
          onClick={handleInstallUfw}
          className="px-4 py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
        >
          Cài đặt UFW
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Left: Status & Controls */}
      <div className="w-80 min-w-80 bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-4 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
            Firewall ({firewallType.toUpperCase()})
          </span>
          {firewallType === 'ufw' && (
            <button
              onClick={handleToggleUfw}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                ufwEnabled ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
              }`}
            >
              <Power size={10} />
              {ufwEnabled ? 'Active' : 'Inactive'}
            </button>
          )}
        </div>

        {/* Warning for SSH */}
        {rules.length > 0 && !rules.some(r => r.to.includes('22') || r.to.includes('ssh')) && ufwEnabled && (
          <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/20 rounded-lg p-2.5 text-[10px] text-[#f38ba8] font-semibold">
            ⚠️ Port SSH (22) chưa được cho phép! Bạn có thể bị khóa khỏi server.
          </div>
        )}

        {firewallType === 'ufw' && (
          <button
            onClick={() => { setShowAddRuleModal(true); setNewRulePort(''); setNewRuleFrom('any') }}
            className="w-full py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={12} /> Thêm Rule
          </button>
        )}

        {/* Quick Allow Presets */}
        {firewallType === 'ufw' && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-[#585b70] uppercase">Quick Allow</span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'SSH', port: '22' },
                { label: 'HTTP', port: '80' },
                { label: 'HTTPS', port: '443' },
                { label: 'MySQL', port: '3306' },
                { label: 'Redis', port: '6379' },
                { label: 'PgSQL', port: '5432' },
              ].map(({ label, port }) => (
                <button
                  key={port}
                  onClick={async () => {
                    setLoading(true)
                    await exec(`sudo ufw allow ${port}`)
                    await fetchFirewall()
                    setLoading(false)
                  }}
                  className="py-1 rounded text-[9px] font-semibold bg-[#11111b] hover:bg-white/5 text-[#a6adc8] transition-all"
                >
                  {label} ({port})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Rules Table or Raw Output */}
      <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        {firewallType === 'ufw' && rules.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                  <th className="p-3">#</th>
                  <th className="p-3">To (Port)</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">From</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, idx) => (
                  <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 text-[#585b70] font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono font-bold text-[#89b4fa]">{rule.to}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        rule.action.includes('ALLOW') ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                      }`}>
                        {rule.action}
                      </span>
                    </td>
                    <td className="p-3 text-[#a6adc8]">{rule.from}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteRule(idx)}
                        className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                        title="Xóa rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-[#a6adc8] whitespace-pre-wrap select-text">
            {ufwStatus || 'Đang tải...'}
          </pre>
        )}
      </div>

      {/* Add Rule Modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddRuleModal(false)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Thêm Firewall Rule</h3>
              <button onClick={() => setShowAddRuleModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Action</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewRuleAction('allow')} className={`flex-1 py-1.5 rounded-lg font-semibold ${newRuleAction === 'allow' ? 'bg-[#a6e3a1] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'}`}>Allow</button>
                  <button onClick={() => setNewRuleAction('deny')} className={`flex-1 py-1.5 rounded-lg font-semibold ${newRuleAction === 'deny' ? 'bg-[#f38ba8] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'}`}>Deny</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Port</label>
                <input type="text" value={newRulePort} onChange={(e) => setNewRulePort(e.target.value)} placeholder="22, 80, 443, 3000:3100" className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">From IP (nguồn)</label>
                <input type="text" value={newRuleFrom} onChange={(e) => setNewRuleFrom(e.target.value)} placeholder="any hoặc 192.168.1.0/24" className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Protocol</label>
                <select value={newRuleProto} onChange={(e) => setNewRuleProto(e.target.value as any)} className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none">
                  <option value="any">Any</option>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowAddRuleModal(false)} className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10">Hủy</button>
                <button onClick={handleAddRule} className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all">Thêm Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
