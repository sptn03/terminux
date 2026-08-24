import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Play,
  Square,
  RotateCw,
  Plus,
  Package,
  FileCode,
  Terminal,
  Layers,
  Sparkles,
  Download
} from 'lucide-react'

interface PhpManagerPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface PhpVersionInfo {
  version: string // e.g. "8.2"
  fpmActive: boolean
  fpmEnabled: boolean
  iniPath: string
  socketPath: string
}

const COMMON_EXTENSIONS = [
  { name: 'mysqli / pdo_mysql', pkg: 'mysql', desc: 'Kết nối cơ sở dữ liệu MySQL / MariaDB' },
  { name: 'pdo_pgsql / pgsql', pkg: 'pgsql', desc: 'Kết nối cơ sở dữ liệu PostgreSQL' },
  { name: 'redis', pkg: 'redis', desc: 'Extension cache Redis tăng tốc ứng dụng' },
  { name: 'gd', pkg: 'gd', desc: 'Xử lý và resize hình ảnh đồ họa' },
  { name: 'mbstring', pkg: 'mbstring', desc: 'Xử lý chuỗi ký tự đa byte (UTF-8)' },
  { name: 'zip', pkg: 'zip', desc: 'Nén và giải nén tệp tin zip' },
  { name: 'curl', pkg: 'curl', desc: 'Gửi request HTTP / REST API' },
  { name: 'xml / dom', pkg: 'xml', desc: 'Xử lý XML và SOAP' },
  { name: 'bcmath', pkg: 'bcmath', desc: 'Phép tính số học độ chính xác cao' },
  { name: 'intl', pkg: 'intl', desc: 'Quốc tế hóa đa ngôn ngữ' },
  { name: 'imagick', pkg: 'imagick', desc: 'ImageMagick xử lý ảnh nâng cao' },
  { name: 'opcache', pkg: 'opcache', desc: 'Cache bytecode PHP tăng tốc 3-5 lần' }
]

export default function PhpManagerPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: PhpManagerPanelProps) {
  const [phpVersions, setPhpVersions] = useState<PhpVersionInfo[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'extensions' | 'raw_ini' | 'composer'>('settings')

  // Form php.ini settings
  const [memoryLimit, setMemoryLimit] = useState('256M')
  const [uploadMaxFilesize, setUploadMaxFilesize] = useState('64M')
  const [postMaxSize, setPostMaxSize] = useState('64M')
  const [maxExecutionTime, setMaxExecutionTime] = useState('120')
  const [maxInputTime, setMaxInputTime] = useState('120')
  const [displayErrors, setDisplayErrors] = useState('Off')
  const [opcacheEnabled, setOpcacheEnabled] = useState('1')

  // Raw INI content
  const [rawIniContent, setRawIniContent] = useState('')
  const [savingIni, setSavingIni] = useState(false)
  const [actionLog, setActionLog] = useState('')

  // Installed Extensions for active version
  const [installedExts, setInstalledExts] = useState<string[]>([])
  const [loadingExts, setLoadingExts] = useState(false)

  // Composer
  const [composerVersion, setComposerVersion] = useState<string | null>(null)
  const [runningComposer, setRunningComposer] = useState(false)

  // Install new PHP version modal
  const [showInstallPhpModal, setShowInstallPhpModal] = useState(false)
  const [installingPhpVersion, setInstallingPhpVersion] = useState<string | null>(null)

  const fetchPhpVersions = useCallback(async () => {
    try {
      // Find all installed php versions
      const checkCmd = `
        for d in /etc/php/*/; do
          [ -d "$d" ] || continue
          ver=$(basename "$d")
          if [ -d "$d/fpm" ] || [ -d "$d/cli" ]; then
            active=$(systemctl is-active php$ver-fpm 2>/dev/null || echo "inactive")
            ini="$d/fpm/php.ini"
            [ -f "$ini" ] || ini="$d/cli/php.ini"
            sock="/run/php/php$ver-fpm.sock"
            echo "$ver::$active::$ini::$sock"
          fi
        done
      `
      const { stdout } = await exec(checkCmd)
      const list: PhpVersionInfo[] = []
      stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          const parts = line.split('::')
          if (parts.length >= 4) {
            list.push({
              version: parts[0],
              fpmActive: parts[1] === 'active',
              fpmEnabled: true,
              iniPath: parts[2],
              socketPath: parts[3]
            })
          }
        })

      setPhpVersions(list)
      if (list.length > 0 && !selectedVersion) {
        setSelectedVersion(list[0].version)
      }

      // Check composer
      const compRes = await exec('composer -V 2>/dev/null || composer --version 2>/dev/null')
      if (compRes.code === 0 && compRes.stdout) {
        setComposerVersion(compRes.stdout.split('\n')[0].trim())
      } else {
        setComposerVersion(null)
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi quét phiên bản PHP')
    }
  }, [exec, selectedVersion, setError])

  const loadPhpIniValues = useCallback(
    async (version: string) => {
      try {
        setLoading(true)
        const iniPath = `/etc/php/${version}/fpm/php.ini`
        const checkIni = await exec(`cat "${iniPath}" 2>/dev/null || cat "/etc/php/${version}/cli/php.ini" 2>/dev/null`)
        const content = checkIni.stdout || ''
        setRawIniContent(content)

        // Parse key values
        const memMatch = content.match(/^memory_limit\s*=\s*([^\s;]+)/m)
        const uploadMatch = content.match(/^upload_max_filesize\s*=\s*([^\s;]+)/m)
        const postMatch = content.match(/^post_max_size\s*=\s*([^\s;]+)/m)
        const execMatch = content.match(/^max_execution_time\s*=\s*([^\s;]+)/m)
        const inputMatch = content.match(/^max_input_time\s*=\s*([^\s;]+)/m)
        const dispMatch = content.match(/^display_errors\s*=\s*([^\s;]+)/m)
        const opMatch = content.match(/^opcache.enable\s*=\s*([^\s;]+)/m)

        if (memMatch) setMemoryLimit(memMatch[1])
        if (uploadMatch) setUploadMaxFilesize(uploadMatch[1])
        if (postMatch) setPostMaxSize(postMatch[1])
        if (execMatch) setMaxExecutionTime(execMatch[1])
        if (inputMatch) setMaxInputTime(inputMatch[1])
        if (dispMatch) setDisplayErrors(dispMatch[1])
        if (opMatch) setOpcacheEnabled(opMatch[1])

        // Load extensions
        const extRes = await exec(`php${version} -m 2>/dev/null || php -m 2>/dev/null`)
        const exts = extRes.stdout
          .toLowerCase()
          .split('\n')
          .map((e) => e.trim())
          .filter(Boolean)
        setInstalledExts(exts)
      } catch (err: any) {
        setActionLog('Lỗi đọc php.ini: ' + err.message)
      } finally {
        setLoading(false)
      }
    },
    [exec, setLoading]
  )

  useEffect(() => {
    fetchPhpVersions()
  }, [fetchPhpVersions, refreshKey])

  useEffect(() => {
    if (selectedVersion) {
      loadPhpIniValues(selectedVersion)
    }
  }, [selectedVersion, loadPhpIniValues])

  const handleSaveIniForm = async () => {
    if (!selectedVersion) return
    setSavingIni(true)
    setActionLog('Đang cập nhật các thông số php.ini...\n')

    try {
      const iniPath = `/etc/php/${selectedVersion}/fpm/php.ini`
      const script = `
        ini="${iniPath}"
        [ -f "$ini" ] || ini="/etc/php/${selectedVersion}/cli/php.ini"
        
        sudo cp "$ini" "$ini.bak" 2>/dev/null || true
        sudo sed -i 's/^memory_limit\s*=.*/memory_limit = ${memoryLimit}/g' "$ini"
        sudo sed -i 's/^upload_max_filesize\s*=.*/upload_max_filesize = ${uploadMaxFilesize}/g' "$ini"
        sudo sed -i 's/^post_max_size\s*=.*/post_max_size = ${postMaxSize}/g' "$ini"
        sudo sed -i 's/^max_execution_time\s*=.*/max_execution_time = ${maxExecutionTime}/g' "$ini"
        sudo sed -i 's/^max_input_time\s*=.*/max_input_time = ${maxInputTime}/g' "$ini"
        sudo sed -i 's/^display_errors\s*=.*/display_errors = ${displayErrors}/g' "$ini"
        sudo sed -i 's/^;\\?opcache.enable\s*=.*/opcache.enable = ${opcacheEnabled}/g' "$ini"

        # Restart FPM
        sudo systemctl restart php${selectedVersion}-fpm 2>/dev/null || true
      `
      const res = await exec(script)
      if (res.code === 0) {
        setActionLog((prev) => prev + '✅ Đã lưu cấu hình và khởi động lại PHP-FPM thành công!\n')
        alert(`Đã lưu cấu hình PHP ${selectedVersion} và restart PHP-FPM thành công!`)
        await loadPhpIniValues(selectedVersion)
        await fetchPhpVersions()
      } else {
        throw new Error(res.stderr || 'Không thể lưu cấu hình')
      }
    } catch (err: any) {
      setActionLog((prev) => prev + `❌ Lỗi: ${err.message}\n`)
      alert('Lỗi lưu php.ini: ' + err.message)
    } finally {
      setSavingIni(false)
    }
  }

  const handleSaveRawIni = async () => {
    if (!selectedVersion) return
    setSavingIni(true)
    try {
      const iniPath = `/etc/php/${selectedVersion}/fpm/php.ini`
      const script = `
        ini="${iniPath}"
        [ -f "$ini" ] || ini="/etc/php/${selectedVersion}/cli/php.ini"
        sudo cp "$ini" "$ini.bak" 2>/dev/null || true
        cat << 'EOF' > /tmp/temp_php_ini
${rawIniContent}
EOF
        sudo mv /tmp/temp_php_ini "$ini"
        sudo systemctl restart php${selectedVersion}-fpm 2>/dev/null || true
      `
      const res = await exec(script)
      if (res.code === 0) {
        alert(`Đã lưu tệp raw php.ini và restart PHP ${selectedVersion} thành công!`)
        await loadPhpIniValues(selectedVersion)
      } else {
        throw new Error(res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setSavingIni(false)
    }
  }

  const handleControlFpm = async (action: 'restart' | 'stop' | 'start') => {
    if (!selectedVersion) return
    setLoading(true)
    try {
      await exec(`sudo systemctl ${action} php${selectedVersion}-fpm`)
      await fetchPhpVersions()
      alert(`Đã thực hiện ${action} php${selectedVersion}-fpm thành công!`)
    } catch (e: any) {
      alert(`Lỗi ${action} FPM: ` + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInstallExtension = async (pkgName: string) => {
    if (!selectedVersion) return
    setLoadingExts(true)
    try {
      const cmd = `sudo apt-get update && sudo apt-get install -y php${selectedVersion}-${pkgName} && sudo systemctl restart php${selectedVersion}-fpm`
      const res = await exec(cmd)
      if (res.code === 0) {
        alert(`Đã cài đặt extension php${selectedVersion}-${pkgName} thành công!`)
        await loadPhpIniValues(selectedVersion)
      } else {
        alert('Lỗi cài đặt extension: ' + res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoadingExts(false)
    }
  }

  const handleInstallPhpVersion = async (ver: string) => {
    setInstallingPhpVersion(ver)
    setActionLog(`Bắt đầu cài đặt PHP ${ver}...\n`)

    try {
      const script = `
        sudo apt-get install -y software-properties-common
        sudo add-apt-repository -y ppa:ondrej/php
        sudo apt-get update
        sudo apt-get install -y php${ver} php${ver}-fpm php${ver}-cli php${ver}-mysql php${ver}-curl php${ver}-gd php${ver}-mbstring php${ver}-xml php${ver}-zip
        sudo systemctl start php${ver}-fpm
        sudo systemctl enable php${ver}-fpm
      `
      const res = await exec(script)
      setActionLog((prev) => prev + res.stdout + '\n' + res.stderr + '\n')
      if (res.code === 0) {
        alert(`Đã cài đặt thành công PHP ${ver} và khởi chạy PHP-FPM!`)
        await fetchPhpVersions()
        setSelectedVersion(ver)
        setShowInstallPhpModal(false)
      } else {
        throw new Error(res.stderr || 'Cài đặt thất bại')
      }
    } catch (e: any) {
      alert('Lỗi cài đặt PHP: ' + e.message)
    } finally {
      setInstallingPhpVersion(null)
    }
  }

  const handleComposerUpdate = async () => {
    setRunningComposer(true)
    try {
      const res = await exec('sudo composer self-update || composer self-update')
      alert(res.stdout || res.stderr || 'Hoàn tất cập nhật Composer')
      await fetchPhpVersions()
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setRunningComposer(false)
    }
  }

  const handleInstallComposer = async () => {
    setRunningComposer(true)
    try {
      const script = `
        curl -sS https://getcomposer.org/installer | php
        sudo mv composer.phar /usr/local/bin/composer
        sudo chmod +x /usr/local/bin/composer
      `
      const res = await exec(script)
      if (res.code === 0) {
        alert('Cài đặt Composer thành công!')
        await fetchPhpVersions()
      } else {
        alert('Lỗi cài đặt Composer: ' + res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setRunningComposer(false)
    }
  }

  const activePhpInfo = phpVersions.find((p) => p.version === selectedVersion)

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Left PHP Versions Sidebar */}
      <div className="w-64 min-w-64 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <Layers size={13} className="text-[#89b4fa]" /> Phiên bản PHP ({phpVersions.length})
          </span>
          <button
            onClick={() => setShowInstallPhpModal(true)}
            className="px-2 py-1 bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
            title="Cài thêm phiên bản PHP"
          >
            <Plus size={12} /> Cài PHP
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
          {phpVersions.length === 0 ? (
            <div className="text-center text-[#585b70] text-xs py-8">
              Chưa phát hiện phiên bản PHP nào.
              <button
                onClick={() => setShowInstallPhpModal(true)}
                className="mt-2 block mx-auto text-[#89b4fa] underline text-xs"
              >
                Cài đặt PHP ngay
              </button>
            </div>
          ) : (
            phpVersions.map((p) => (
              <div
                key={p.version}
                onClick={() => setSelectedVersion(p.version)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedVersion === p.version
                    ? 'bg-[#89b4fa]/15 border-[#89b4fa]/40 text-[#cdd6f4]'
                    : 'bg-[#11111b]/30 border-white/[0.02] text-[#a6adc8] hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#cdd6f4]">PHP {p.version}</span>
                  <span
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                      p.fpmActive ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]' : 'bg-[#f38ba8]/20 text-[#f38ba8]'
                    }`}
                  >
                    {p.fpmActive ? 'FPM Đang Chạy' : 'FPM Dừng'}
                  </span>
                </div>
                <div className="text-[10px] text-[#585b70] font-mono truncate mt-1">{p.socketPath}</div>
              </div>
            ))
          )}
        </div>

        {/* Composer Status Box */}
        <div className="p-3 border-t border-white/[0.04] bg-[#11111b]/40 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#585b70] font-semibold flex items-center gap-1.5">
              <Package size={12} className="text-[#fab387]" /> Composer
            </span>
            <span className="text-[#a6adc8] font-mono text-[10px]">
              {composerVersion ? composerVersion.split(' ')[2] || 'OK' : 'Chưa cài'}
            </span>
          </div>
          {composerVersion ? (
            <button
              onClick={handleComposerUpdate}
              disabled={runningComposer}
              className="w-full py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#cdd6f4] transition-all flex items-center justify-center gap-1"
            >
              <RotateCw size={11} className={runningComposer ? 'animate-spin' : ''} />
              Self Update Composer
            </button>
          ) : (
            <button
              onClick={handleInstallComposer}
              disabled={runningComposer}
              className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[#fab387]/20 hover:bg-[#fab387]/30 text-[#fab387] transition-all"
            >
              Cài Composer 1-Click
            </button>
          )}
        </div>
      </div>

      {/* Main PHP Details & Config Area */}
      <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        {selectedVersion ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header Toolbar */}
            <div className="px-5 py-3 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-[#cdd6f4]">PHP {selectedVersion} Manager</span>
                <span className="text-xs text-[#585b70] font-mono">
                  Socket: /run/php/php{selectedVersion}-fpm.sock
                </span>
              </div>

              {/* Service Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleControlFpm('restart')}
                  className="px-3 py-1 rounded-lg bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Khởi động lại PHP-FPM"
                >
                  <RotateCw size={12} /> Restart FPM
                </button>
                {activePhpInfo?.fpmActive ? (
                  <button
                    onClick={() => handleControlFpm('stop')}
                    className="px-3 py-1 rounded-lg bg-[#f38ba8]/15 hover:bg-[#f38ba8]/25 text-[#f38ba8] text-xs font-semibold flex items-center gap-1 transition-all"
                  >
                    <Square size={12} /> Dừng FPM
                  </button>
                ) : (
                  <button
                    onClick={() => handleControlFpm('start')}
                    className="px-3 py-1 rounded-lg bg-[#a6e3a1]/15 hover:bg-[#a6e3a1]/25 text-[#a6e3a1] text-xs font-semibold flex items-center gap-1 transition-all"
                  >
                    <Play size={12} /> Bật FPM
                  </button>
                )}
              </div>
            </div>

            {/* Sub-tabs Header */}
            <div className="px-5 border-b border-white/[0.04] bg-[#181825] flex gap-4 text-xs font-semibold">
              {[
                { id: 'settings', label: 'Cấu hình php.ini (Trực quan)' },
                { id: 'extensions', label: 'Quản lý Extensions' },
                { id: 'raw_ini', label: 'Trình soạn thảo Raw php.ini' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`py-3 border-b-2 transition-all ${
                    activeSubTab === tab.id
                      ? 'border-[#89b4fa] text-[#89b4fa]'
                      : 'border-transparent text-[#a6adc8] hover:text-[#cdd6f4]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sub-tab 1: Visual INI Settings */}
            {activeSubTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
                <div className="grid grid-cols-2 gap-5 max-w-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">memory_limit (Giới hạn RAM)</label>
                    <input
                      type="text"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value)}
                      placeholder="256M"
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    />
                    <span className="text-[10px] text-[#585b70]">Ví dụ: 128M, 256M, 512M, 1024M hoặc -1</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">upload_max_filesize (Dung lượng Upload tối đa)</label>
                    <input
                      type="text"
                      value={uploadMaxFilesize}
                      onChange={(e) => setUploadMaxFilesize(e.target.value)}
                      placeholder="64M"
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    />
                    <span className="text-[10px] text-[#585b70]">Ví dụ: 32M, 64M, 128M, 500M</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">post_max_size (Dung lượng POST tối đa)</label>
                    <input
                      type="text"
                      value={postMaxSize}
                      onChange={(e) => setPostMaxSize(e.target.value)}
                      placeholder="64M"
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    />
                    <span className="text-[10px] text-[#585b70]">Nên lớn hơn hoặc bằng upload_max_filesize</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">max_execution_time (Thời gian chạy tối đa - giây)</label>
                    <input
                      type="text"
                      value={maxExecutionTime}
                      onChange={(e) => setMaxExecutionTime(e.target.value)}
                      placeholder="120"
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    />
                    <span className="text-[10px] text-[#585b70]">Mặc định 30, khuyến nghị 120 - 300 cho web tải nặng</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">display_errors (Hiển thị lỗi)</label>
                    <select
                      value={displayErrors}
                      onChange={(e) => setDisplayErrors(e.target.value)}
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    >
                      <option value="Off">Off (Khuyến nghị cho Production)</option>
                      <option value="On">On (Dùng khi debug phát triển)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#a6adc8]">opcache.enable (Tăng tốc OPcache)</label>
                    <select
                      value={opcacheEnabled}
                      onChange={(e) => setOpcacheEnabled(e.target.value)}
                      className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
                    >
                      <option value="1">1 (Bật - Tối ưu hiệu năng cao)</option>
                      <option value="0">0 (Tắt)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3 max-w-2xl">
                  <button
                    onClick={handleSaveIniForm}
                    disabled={savingIni}
                    className="px-6 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                  >
                    {savingIni ? 'Đang lưu & restart FPM...' : 'Lưu cấu hình & Áp dụng'}
                  </button>
                </div>
              </div>
            )}

            {/* Sub-tab 2: Extensions */}
            {activeSubTab === 'extensions' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
                <div className="grid grid-cols-2 gap-3 max-w-4xl">
                  {COMMON_EXTENSIONS.map((ext) => {
                    const isInstalled = installedExts.some((e) => e.includes(ext.pkg) || ext.name.toLowerCase().includes(e))
                    return (
                      <div
                        key={ext.pkg}
                        className="p-3.5 rounded-xl bg-[#11111b]/40 border border-white/5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-[#cdd6f4] truncate">{ext.name}</h4>
                            {isInstalled && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-[#a6e3a1]/20 text-[#a6e3a1] font-semibold rounded">
                                Đã cài
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#585b70] mt-0.5 truncate">{ext.desc}</p>
                        </div>

                        {!isInstalled && (
                          <button
                            onClick={() => handleInstallExtension(ext.pkg)}
                            disabled={loadingExts}
                            className="px-3 py-1.5 rounded-lg bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] text-xs font-semibold shrink-0"
                          >
                            Cài đặt
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Sub-tab 3: Raw INI */}
            {activeSubTab === 'raw_ini' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2 border-b border-white/[0.04] bg-[#11111b]/40 flex justify-between items-center px-4">
                  <span className="text-xs text-[#585b70] font-mono">/etc/php/{selectedVersion}/fpm/php.ini</span>
                  <button
                    onClick={handleSaveRawIni}
                    disabled={savingIni}
                    className="px-4 py-1 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 transition-all"
                  >
                    {savingIni ? 'Đang Lưu...' : 'Lưu Tệp INI'}
                  </button>
                </div>
                <textarea
                  value={rawIniContent}
                  onChange={(e) => setRawIniContent(e.target.value)}
                  className="flex-1 p-4 bg-[#181825] text-xs text-[#cdd6f4] outline-none font-mono resize-none leading-relaxed"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
            <Sliders size={40} className="opacity-30 text-[#89b4fa] mb-2" />
            <span className="text-xs">Chọn một phiên bản PHP từ danh sách bên trái</span>
          </div>
        )}
      </div>

      {/* Install PHP Version Modal */}
      {showInstallPhpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowInstallPhpModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[460px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={14} className="text-[#89b4fa]" /> Cài Đặt Thêm Phiên Bản PHP
              </h3>
              <button onClick={() => setShowInstallPhpModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                X
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-[#a6adc8] text-xs leading-relaxed">
                Hệ thống sẽ tự động thêm repository chính thức <code>ppa:ondrej/php</code> và cài đặt đầy đủ gói PHP-FPM kèm các extension cốt lõi.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {['8.3', '8.2', '8.1', '8.0', '7.4'].map((v) => {
                  const already = phpVersions.some((p) => p.version === v)
                  return (
                    <button
                      key={v}
                      disabled={already || installingPhpVersion !== null}
                      onClick={() => handleInstallPhpVersion(v)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 font-bold transition-all ${
                        already
                          ? 'bg-white/[0.02] border-white/5 text-[#585b70] cursor-not-allowed'
                          : 'bg-[#89b4fa]/10 border-[#89b4fa]/30 text-[#89b4fa] hover:bg-[#89b4fa]/20 active:scale-95'
                      }`}
                    >
                      <span className="text-sm">PHP {v}</span>
                      <span className="text-[10px] font-normal">
                        {already ? 'Đã cài đặt' : installingPhpVersion === v ? 'Đang cài...' : 'Bấm để cài'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {actionLog && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-[#585b70] font-semibold">Tiến trình cài đặt</label>
                  <pre className="h-32 overflow-y-auto bg-[#11111b] p-2.5 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                    {actionLog}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
