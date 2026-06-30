import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

interface PackagesPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function PackagesPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: PackagesPanelProps) {
  const [packagesList, setPackagesList] = useState<any[]>([])
  const [installingPackage, setInstallingPackage] = useState<string | null>(null)
  const [installLogs, setInstallLogs] = useState('')

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
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-[#a6adc8] font-semibold">Trình quản lý gói phần mềm thiết yếu</span>
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
                      onClick={async () => {
                        const sudoPass = prompt('Nhập mật khẩu sudo (nếu cần, hoặc để trống):')
                        setInstallingPackage(p.name)
                        setInstallLogs(`Bắt đầu cài đặt ${p.name}...\n`)
                        let cmd = `sudo apt-get install -y ${p.pkg} || sudo yum install -y ${p.pkg}`
                        if (sudoPass) {
                          cmd = `echo "${sudoPass}" | sudo -S apt-get install -y ${p.pkg} || echo "${sudoPass}" | sudo -S yum install -y ${p.pkg}`
                        }
                        const result = await exec(cmd)
                        setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n'))
                        await fetchPackages()
                      }}
                      className="px-3 py-1 rounded bg-[#a6e3a1] text-[#1e1e2e] font-semibold text-[10px] hover:bg-[#89d48b] transition-all"
                    >
                      Cài đặt nhanh
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        if (confirm(`Gỡ cài đặt ${p.name}?`)) {
                          const sudoPass = prompt('Nhập mật khẩu sudo (nếu cần, hoặc để trống):')
                          setInstallingPackage(p.name)
                          setInstallLogs(`Bắt đầu gỡ cài đặt ${p.name}...\n`)
                          let cmd = `sudo apt-get remove -y ${p.pkg} || sudo yum remove -y ${p.pkg}`
                          if (sudoPass) {
                            cmd = `echo "${sudoPass}" | sudo -S apt-get remove -y ${p.pkg} || echo "${sudoPass}" | sudo -S yum remove -y ${p.pkg}`
                          }
                          const result = await exec(cmd)
                          setInstallLogs((prev) => prev + (result.stdout || result.stderr || 'Hoàn tất.\n'))
                          await fetchPackages()
                        }
                      }}
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
                <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] animate-ping" />
                Tiến trình gói: {installingPackage}
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
