import { useState, useEffect, useCallback } from 'react'
import { X, Search, ArrowUp } from 'lucide-react'

interface PackagesPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface PkgInfo {
  name: string
  cmd: string
  pkg: string
  installed: boolean
  version: string
}

interface UpgradableItem {
  name: string
  current: string
  available: string
}

export default function PackagesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: PackagesPanelProps) {
  const [packagesList, setPackagesList] = useState<PkgInfo[]>([])
  const [installingPackage, setInstallingPackage] = useState<string | null>(null)
  const [installFinished, setInstallFinished] = useState(false)
  const [installLogs, setInstallLogs] = useState('')
  const [customPkgInput, setCustomPkgInput] = useState('')
  const [upgradableList, setUpgradableList] = useState<UpgradableItem[]>([])
  const [showUpgradable, setShowUpgradable] = useState(false)

  const fetchPackages = useCallback(async () => {
    try {
      const pkgs = [
        { name: 'Nginx', cmd: 'nginx', pkg: 'nginx' },
        { name: 'Docker', cmd: 'docker', pkg: 'docker.io' },
        { name: 'Node.js', cmd: 'node', pkg: 'nodejs' },
        { name: 'Git', cmd: 'git', pkg: 'git' },
        { name: 'PM2', cmd: 'pm2', pkg: 'pm2' },
        { name: 'MySQL', cmd: 'mysql', pkg: 'mysql-server' },
        { name: 'Redis', cmd: 'redis-server', pkg: 'redis-server' },
        { name: 'Python3', cmd: 'python3', pkg: 'python3' },
        { name: 'Certbot', cmd: 'certbot', pkg: 'certbot' }
      ]
      const updated = await Promise.all(
        pkgs.map(async (p) => {
          const { stdout } = await exec(`which ${p.cmd} 2>/dev/null && ${p.cmd} --version || echo "not installed"`)
          const installed = !stdout.includes('not installed') && stdout.trim() !== ''
          const version = installed
            ? stdout
                .split('\n')[0]
                .replace(/Docker version |node |git version |pm2 |mysql /i, '')
                .trim()
            : '-'
          return { ...p, installed, version }
        })
      )
      setPackagesList(updated)
    } catch (e: any) {
      setError(e.message || 'Lỗi kiểm tra danh sách phần mềm')
    }
  }, [exec, setError])

  const handleCheckUpgradable = async () => {
    setLoading(true)
    const { stdout } = await exec('apt list --upgradable 2>/dev/null || yum list updates 2>/dev/null || echo "Không hỗ trợ"')
    if (stdout.trim() === 'Không hỗ trợ') {
      setError('Máy chủ không có apt/yum nên không kiểm tra được bản cập nhật.')
      setLoading(false)
      return
    }
    const items: UpgradableItem[] = []
    stdout.split('\n').forEach((line) => {
      // apt format: package/codename version arch [upgradable from: version]
      const match = line.match(/^(\S+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s+(\S+)\]/)
      if (match) {
        items.push({ name: match[1], available: match[2], current: match[3] })
      }
    })
    setUpgradableList(items)
    setShowUpgradable(true)
    setLoading(false)
  }

  const handleInstallPkg = async (pkgName: string) => {
    setInstallingPackage(pkgName)
    setInstallFinished(false)
    setInstallLogs(`Bắt đầu cài đặt ${pkgName}...\n`)
    const cmd = `sudo apt-get install -y ${pkgName} || sudo yum install -y ${pkgName}`
    const result = await exec(cmd)
    setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n') + `\n[exit code: ${result.code}]`)
    await fetchPackages()
    setInstallFinished(true)
  }

  const handleRemovePkg = async (pkgName: string) => {
    if (!confirm(`Gỡ cài đặt ${pkgName}?`)) return
    setInstallingPackage(pkgName)
    setInstallFinished(false)
    setInstallLogs(`Bắt đầu gỡ cài đặt ${pkgName}...\n`)
    const cmd = `sudo apt-get remove -y ${pkgName} || sudo yum remove -y ${pkgName}`
    const result = await exec(cmd)
    setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n') + `\n[exit code: ${result.code}]`)
    await fetchPackages()
    setInstallFinished(true)
  }

  const handleCustomInstall = async () => {
    const pkg = customPkgInput.trim()
    if (!pkg) return
    // Basic sanitization - only allow alphanumeric, hyphen, underscore, dot
    if (!/^[a-zA-Z0-9._-]+$/.test(pkg)) {
      alert('Tên gói không hợp lệ. Chỉ được dùng chữ, số, dấu gạch ngang và gạch dưới.')
      return
    }
    await handleInstallPkg(pkg)
    setCustomPkgInput('')
  }

  const handleUpgradeAll = async () => {
    if (!confirm(`Nâng cấp ${upgradableList.length} gói?`)) return
    setInstallingPackage('Upgrade All')
    setInstallFinished(false)
    setInstallLogs('Đang nâng cấp tất cả gói...\n')
    const result = await exec('sudo apt-get upgrade -y || sudo yum update -y')
    setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n'))
    await fetchPackages()
    setUpgradableList([])
    setInstallFinished(true)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchPackages()
    setLoading(false)
  }, [fetchPackages, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <span className="text-xs text-[#a6adc8] font-semibold">Trình quản lý gói phần mềm</span>
        <div className="flex gap-2">
          <button
            onClick={handleCheckUpgradable}
            className="px-3 py-1 rounded bg-[#f9e2af]/10 text-[#f9e2af] text-xs font-semibold hover:bg-[#f9e2af]/20 transition-all flex items-center gap-1"
          >
            <ArrowUp size={11} /> Check Updates
          </button>
          <button
            onClick={async () => {
              if (confirm('Cập nhật chỉ mục gói (apt update)?')) {
                setInstallingPackage('Update System')
                setInstallLogs('Đang chạy cập nhật chỉ mục gói...\n')
                const result = await exec('sudo apt-get update || sudo yum makecache')
                setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n'))
                await fetchPackages()
              }
            }}
            className="px-3 py-1 rounded bg-[#89b4fa]/10 text-[#89b4fa] text-xs font-semibold hover:bg-[#89b4fa]/20 transition-all"
          >
            Update System Index
          </button>
        </div>
      </div>

      {/* Custom Package Install */}
      <div className="bg-[#181825] border border-white/[0.04] rounded-lg px-3 py-2 mb-3 flex gap-2 items-center shrink-0">
        <Search size={12} className="text-[#585b70] shrink-0" />
        <input
          type="text"
          placeholder="Cài đặt gói tùy chỉnh (vd: htop, curl, jq)..."
          value={customPkgInput}
          onChange={(e) => setCustomPkgInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCustomInstall() }}
          className="flex-1 bg-transparent text-xs text-[#cdd6f4] outline-none"
        />
        <button
          onClick={handleCustomInstall}
          disabled={!customPkgInput.trim()}
          className="px-3 py-1 rounded bg-[#a6e3a1] text-[#1e1e2e] text-[10px] font-bold hover:bg-[#89d48b] transition-all disabled:opacity-40"
        >
          Install
        </button>
      </div>

      {/* Upgradable packages */}
      {showUpgradable && upgradableList.length > 0 && (
        <div className="bg-[#f9e2af]/5 border border-[#f9e2af]/10 rounded-lg p-3 mb-3 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-[#f9e2af]">{upgradableList.length} gói có bản cập nhật</span>
            <div className="flex gap-2">
              <button onClick={handleUpgradeAll} className="px-2 py-0.5 rounded bg-[#f9e2af] text-[#1e1e2e] text-[10px] font-bold">
                Upgrade All
              </button>
              <button onClick={() => setShowUpgradable(false)} className="text-[#585b70] hover:text-[#cdd6f4]">
                <X size={12} />
              </button>
            </div>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] font-mono">
            {upgradableList.map((u) => (
              <div key={u.name} className="flex justify-between text-[#a6adc8]">
                <span className="text-[#cdd6f4] font-bold">{u.name}</span>
                <span>{u.current} → <span className="text-[#a6e3a1]">{u.available}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showUpgradable && upgradableList.length === 0 && (
        <div className="bg-[#a6e3a1]/5 border border-[#a6e3a1]/10 rounded-lg p-3 mb-3 text-xs text-[#a6e3a1] shrink-0 flex items-center justify-between">
          <span>Tất cả gói đã được cập nhật ✓</span>
          <button onClick={() => setShowUpgradable(false)} className="text-[#585b70] hover:text-[#cdd6f4]"><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
              <th className="p-3">Tên phần mềm</th>
              <th className="p-3">Package Name</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Phiên bản</th>
              <th className="p-3 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {packagesList.map((p, idx) => (
              <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-bold text-[#cdd6f4]">{p.name}</td>
                <td className="p-3 font-mono text-[#585b70]">{p.pkg}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      p.installed ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                    }`}
                  >
                    {p.installed ? 'Đã cài đặt' : 'Chưa cài đặt'}
                  </span>
                </td>
                <td className="p-3 font-mono text-[#a6adc8]">{p.version}</td>
                <td className="p-3 text-center">
                  {!p.installed ? (
                    <button
                      onClick={() => handleInstallPkg(p.pkg)}
                      className="px-3 py-1 rounded bg-[#a6e3a1] text-[#1e1e2e] font-semibold text-[10px] hover:bg-[#89d48b] transition-all"
                    >
                      Cài đặt
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRemovePkg(p.pkg)}
                      className="px-3 py-1 rounded bg-[#f38ba8]/10 text-[#f38ba8] font-semibold text-[10px] hover:bg-[#f38ba8]/20 transition-all"
                    >
                      Gỡ cài đặt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Installing Package Logs Modal */}
      {installingPackage !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${installFinished ? 'bg-[#a6e3a1]' : 'bg-[#a6e3a1] animate-ping'}`} />
                {installFinished ? 'Đã hoàn tất' : 'Tiến trình gói'}: {installingPackage}
              </h3>
              <button
                onClick={() => {
                  setInstallingPackage(null)
                  setInstallLogs('')
                }}
                className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#a6adc8] leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
              {installLogs}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
