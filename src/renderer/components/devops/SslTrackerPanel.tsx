import { useState, useEffect, useCallback, useRef } from 'react'
import { ShieldCheck, ShieldAlert, Plus, Trash2, RefreshCw, X, Calendar, Award, ExternalLink } from 'lucide-react'

interface DomainStatus {
  domain: string
  expiryDate: string
  issuer: string
  daysLeft: number | null
  loading: boolean
  error?: string
}

interface SslTrackerPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function SslTrackerPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: SslTrackerPanelProps) {
  const [domains, setDomains] = useState<string[]>([])
  const [domainStatus, setDomainStatus] = useState<Record<string, DomainStatus>>({})
  const checkedRef = useRef<Set<string>>(new Set())
  
  // Add domain modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)

  const loadDomainsFromDb = useCallback(async () => {
    try {
      const rows = await window.api.db.all("SELECT value FROM app_settings WHERE key = 'devops_ssl_domains'")
      if (rows.length > 0 && rows[0].value) {
        setDomains(JSON.parse(rows[0].value))
      } else {
        setDomains([])
      }
    } catch (err: any) {
      setDomains([])
      setError('Không đọc được danh sách domain SSL: ' + (err.message || 'lỗi không xác định'))
    }
  }, [setError])

  const saveDomainsToDb = async (updatedDomains: string[]) => {
    setDomains(updatedDomains)
    await window.api.db.run(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_ssl_domains', ?)",
      [JSON.stringify(updatedDomains)]
    )
  }

  const checkDomainSsl = useCallback(async (domain: string) => {
    setDomainStatus((prev) => ({
      ...prev,
      [domain]: {
        domain,
        expiryDate: '',
        issuer: '',
        daysLeft: null,
        loading: true
      }
    }))

    try {
      const cmd = `echo | openssl s_client -servername "${domain}" -connect "${domain}":443 2>/dev/null | openssl x509 -noout -enddate -issuer 2>/dev/null || echo "failed"`
      const res = await exec(cmd)

      if (res.stdout.includes('failed') || !res.stdout.includes('notAfter')) {
        throw new Error('Không thể kết nối hoặc đọc chứng chỉ SSL')
      }

      // Parse output:
      // notAfter=Oct  1 23:59:59 2026 GMT
      // issuer=C = US, O = Let's Encrypt, CN = R10
      const lines = res.stdout.split('\n')
      let notAfterLine = ''
      let issuerLine = ''

      lines.forEach((l) => {
        if (l.startsWith('notAfter=')) notAfterLine = l.replace('notAfter=', '')
        if (l.startsWith('issuer=')) issuerLine = l.replace('issuer=', '')
      })

      if (!notAfterLine) throw new Error('Không tìm thấy ngày hết hạn')

      const expiryDate = new Date(notAfterLine)
      const now = new Date()
      const diffTime = expiryDate.getTime() - now.getTime()
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      let issuerName = 'Unknown'
      const cnMatch = issuerLine.match(/CN\s*=\s*([^,]+)/)
      const oMatch = issuerLine.match(/O\s*=\s*([^,]+)/)
      
      if (cnMatch) {
        issuerName = cnMatch[1].trim()
      } else if (oMatch) {
        issuerName = oMatch[1].trim()
      }

      setDomainStatus((prev) => ({
        ...prev,
        [domain]: {
          domain,
          expiryDate: expiryDate.toLocaleDateString(),
          issuer: issuerName,
          daysLeft,
          loading: false
        }
      }))
    } catch (err: any) {
      setDomainStatus((prev) => ({
        ...prev,
        [domain]: {
          domain,
          expiryDate: '-',
          issuer: '-',
          daysLeft: null,
          loading: false,
          error: err.message || 'Lỗi kiểm tra SSL'
        }
      }))
    }
  }, [exec])

  const handleAddDomain = async () => {
    const cleanDomain = newDomain.trim().toLowerCase()
    if (!cleanDomain) return

    if (domains.includes(cleanDomain)) {
      alert('Tên miền đã tồn tại!')
      return
    }

    setAddingDomain(true)
    const updated = [...domains, cleanDomain]
    await saveDomainsToDb(updated)
    setNewDomain('')
    setShowAddModal(false)
    setAddingDomain(false)
  }

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Xóa tên miền "${domain}" khỏi danh sách theo dõi?`)) return
    checkedRef.current.delete(domain)
    const updated = domains.filter((d) => d !== domain)
    await saveDomainsToDb(updated)
    setDomainStatus((prev) => {
      const copy = { ...prev }
      delete copy[domain]
      return copy
    })
  }

  const handleRefreshAll = async () => {
    setLoading(true)
    setError('')
    checkedRef.current.clear()
    await Promise.all(
      domains.map((d) => {
        checkedRef.current.add(d)
        return checkDomainSsl(d)
      })
    )
    setLoading(false)
  }

  useEffect(() => {
    checkedRef.current.clear()
    loadDomainsFromDb()
  }, [loadDomainsFromDb, refreshKey])

  useEffect(() => {
    if (domains.length > 0) {
      domains.forEach((d) => {
        if (!checkedRef.current.has(d)) {
          checkedRef.current.add(d)
          checkDomainSsl(d)
        }
      })
    }
  }, [domains, checkDomainSsl])

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {/* Header toolbar */}
      <div className="flex justify-between items-center mb-4 bg-[#181825] border border-white/[0.04] p-3 rounded-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#a6e3a1]/10 text-[#a6e3a1]">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#cdd6f4]">Giám sát chứng chỉ SSL</h4>
            <span className="text-[10px] font-semibold text-[#585b70]">
              Theo dõi thời hạn và thông tin Certificate của các website
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRefreshAll}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Làm mới tất cả
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all flex items-center gap-1"
          >
            <Plus size={13} /> Thêm Domain
          </button>
        </div>
      </div>

      {/* Grid container */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4 scrollbar-thin">
        {domains.length === 0 ? (
          <div className="col-span-full text-center text-[#585b70] text-xs py-12">
            Chưa theo dõi tên miền nào. Hãy thêm domain để theo dõi SSL.
          </div>
        ) : (
          domains.map((domain) => {
            const status = domainStatus[domain]
            if (!status) return null

            const isExpired = status.daysLeft !== null && status.daysLeft <= 0
            const isWarning = status.daysLeft !== null && status.daysLeft <= 15
            const statusColor = status.error
              ? 'border-[#f38ba8]/20 bg-[#f38ba8]/5'
              : isExpired
              ? 'border-[#f38ba8]/30 bg-[#f38ba8]/5'
              : isWarning
              ? 'border-[#fab387]/30 bg-[#fab387]/5'
              : 'border-[#a6e3a1]/25 bg-[#a6e3a1]/5'

            return (
              <div
                key={domain}
                className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 relative group transition-all hover:scale-[1.01] ${statusColor}`}
              >
                {/* Delete button top right */}
                <button
                  onClick={() => handleDeleteDomain(domain)}
                  className="absolute top-3 right-3 p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#f38ba8] opacity-0 group-hover:opacity-100 transition-all"
                  title="Xóa theo dõi"
                >
                  <Trash2 size={12} />
                </button>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="font-bold text-xs text-[#cdd6f4] select-text">{domain}</span>
                    <a
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#89b4fa] hover:underline"
                    >
                      <ExternalLink size={10} />
                    </a>
                  </div>

                  {status.loading ? (
                    <div className="text-[10px] text-[#585b70] flex items-center gap-1.5 py-4">
                      <RefreshCw size={11} className="animate-spin" /> Đang kiểm tra...
                    </div>
                  ) : status.error ? (
                    <div className="text-[10px] text-[#f38ba8] bg-[#f38ba8]/5 border border-[#f38ba8]/10 rounded px-2.5 py-1.5 flex items-start gap-1 font-mono">
                      <ShieldAlert size={12} className="shrink-0 mt-0.5" />
                      <span>{status.error}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[10px] text-[#bac2de]">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-[#585b70]" />
                        <span>Hết hạn: <span className="font-mono text-[#cdd6f4]">{status.expiryDate}</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award size={11} className="text-[#585b70]" />
                        <span>Tổ chức cấp: <span className="text-[#cdd6f4] font-semibold">{status.issuer}</span></span>
                      </div>
                    </div>
                  )}
                </div>

                {!status.loading && !status.error && (
                  <div className="flex justify-between items-center pt-2 border-t border-white/[0.04] text-[10px]">
                    <span className="text-[#585b70]">Thời hạn còn lại</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold font-mono ${
                        isExpired
                          ? 'bg-[#f38ba8]/25 text-[#f38ba8]'
                          : isWarning
                          ? 'bg-[#fab387]/25 text-[#fab387]'
                          : 'bg-[#a6e3a1]/25 text-[#a6e3a1]'
                      }`}
                    >
                      {status.daysLeft} ngày
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add Domain Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false)
          }}
        >
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[360px] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Thêm Domain theo dõi SSL
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên miền (Domain) *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="ví dụ: mywebsite.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddDomain()
                  }}
                  disabled={addingDomain}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                  disabled={addingDomain}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddDomain}
                  disabled={addingDomain}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
