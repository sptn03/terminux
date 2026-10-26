import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Sliders,
  CheckCircle,
  Play,
  Square,
  RotateCw,
  Plus,
  Package,
  Layers,
  Download,
  Check,
  Zap,
  Cpu,
  X
} from 'lucide-react'

interface PhpManagerPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface PhpVersionInfo {
  version: string
  fpmActive: boolean
  fpmEnabled: boolean
  iniPath: string
  socketPath: string
}

const COMMON_EXTENSIONS = [
  { name: 'MySQL / MariaDB', pkg: 'mysql', desc: 'Kết nối MySQL/MariaDB qua mysqli & PDO' },
  { name: 'PostgreSQL', pkg: 'pgsql', desc: 'Kết nối cơ sở dữ liệu PostgreSQL' },
  { name: 'Redis Cache', pkg: 'redis', desc: 'Bộ nhớ đệm Redis tốc độ cao' },
  { name: 'GD Graphics', pkg: 'gd', desc: 'Xử lý và chuyển đổi hình ảnh' },
  { name: 'MBString', pkg: 'mbstring', desc: 'Hỗ trợ ký tự đa byte UTF-8' },
  { name: 'ZIP Archive', pkg: 'zip', desc: 'Nén và giải nén tệp tin .zip' },
  { name: 'cURL HTTP', pkg: 'curl', desc: 'Truy vấn REST API qua HTTP Client' },
  { name: 'XML & DOM', pkg: 'xml', desc: 'Xử lý XML, RSS và SOAP' },
  { name: 'BCMath', pkg: 'bcmath', desc: 'Phép toán số học độ chính xác cao' },
  { name: 'Intl i18n', pkg: 'intl', desc: 'Hỗ trợ đa ngôn ngữ quốc tế hóa' },
  { name: 'ImageMagick', pkg: 'imagick', desc: 'Thư viện xử lý đồ họa vector & bitmap' },
  { name: 'Zend OPcache', pkg: 'opcache', desc: 'Bộ nhớ đệm bytecode tăng tốc 3x' }
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
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'extensions' | 'raw_ini'>('settings')

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
        sudo sed -i 's/^memory_limit[[:space:]]*=.*/memory_limit = ${memoryLimit}/g' "$ini"
        sudo sed -i 's/^upload_max_filesize[[:space:]]*=.*/upload_max_filesize = ${uploadMaxFilesize}/g' "$ini"
        sudo sed -i 's/^post_max_size[[:space:]]*=.*/post_max_size = ${postMaxSize}/g' "$ini"
        sudo sed -i 's/^max_execution_time[[:space:]]*=.*/max_execution_time = ${maxExecutionTime}/g' "$ini"
        sudo sed -i 's/^max_input_time[[:space:]]*=.*/max_input_time = ${maxInputTime}/g' "$ini"
        sudo sed -i 's/^display_errors[[:space:]]*=.*/display_errors = ${displayErrors}/g' "$ini"
        sudo sed -i 's/^;\\?[[:space:]]*opcache.enable[[:space:]]*=.*/opcache.enable = ${opcacheEnabled}/g' "$ini"

        grep -q "^memory_limit[[:space:]]*=[[:space:]]*${memoryLimit}" "$ini" || { echo "Không ghi được memory_limit vào $ini" >&2; exit 1; }

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
    <div className="flex-1 flex gap-4 overflow-hidden animate-fade-in">
      {/* Left Sidebar */}
      <div className="w-72 min-w-72 bg-[#181825]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden shadow-xl">
        <div className="p-3.5 bg-[#11111b]/50 border-b border-white/[0.04] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#cba6f7] shadow-[0_0_8px_#cba6f7]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4]">PHP Engines</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-[#a6adc8] font-mono">
              {phpVersions.length}
            </span>
          </div>
          <button
            onClick={() => setShowInstallPhpModal(true)}
            className="px-2.5 py-1 bg-[#cba6f7]/15 hover:bg-[#cba6f7]/25 text-[#cba6f7] rounded-lg text-xs font-semibold flex items-center gap-1 border border-[#cba6f7]/30 transition-all shadow-sm"
          >
            <Plus size={13} /> Cài PHP
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
          {phpVersions.length === 0 ? (
            <div className="text-center text-[#585b70] text-xs py-12 flex flex-col items-center gap-2">
              <Layers size={24} className="opacity-30" />
              <span>Chưa phát hiện phiên bản PHP</span>
              <button
                onClick={() => setShowInstallPhpModal(true)}
                className="mt-1 text-[#89b4fa] underline text-xs font-semibold"
              >
                Cài đặt PHP ngay
              </button>
            </div>
          ) : (
            phpVersions.map((p) => (
              <div
                key={p.version}
                onClick={() => setSelectedVersion(p.version)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedVersion === p.version
                    ? 'bg-[#cba6f7]/15 border-[#cba6f7]/40 shadow-[0_4px_16px_rgba(203,166,247,0.12)]'
                    : 'bg-[#11111b]/30 border-white/[0.03] hover:bg-white/[0.03] hover:border-white/[0.08]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        p.fpmActive ? 'bg-[#a6e3a1] shadow-[0_0_8px_#a6e3a1]' : 'bg-[#f38ba8]'
                      }`}
                    />
                    <span className="font-bold text-xs text-[#cdd6f4]">PHP {p.version}</span>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                      p.fpmActive ? 'bg-[#a6e3a1]/15 text-[#a6e3a1]' : 'bg-[#f38ba8]/15 text-[#f38ba8]'
                    }`}
                  >
                    {p.fpmActive ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>
                <div className="text-[10px] text-[#585b70] font-mono truncate mt-1.5">{p.socketPath}</div>
              </div>
            ))
          )}
        </div>

        {/* Composer Card */}
        <div className="p-3.5 border-t border-white/[0.04] bg-[#11111b]/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a6adc8] font-bold flex items-center gap-1.5">
              <Package size={13} className="text-[#fab387]" /> Composer CLI
            </span>
            <span className="text-[#89b4fa] font-mono text-[10px] bg-[#89b4fa]/10 px-1.5 py-0.5 rounded">
              {composerVersion ? composerVersion.split(' ')[2] || 'OK' : 'Chưa cài'}
            </span>
          </div>
          {composerVersion ? (
            <button
              onClick={handleComposerUpdate}
              disabled={runningComposer}
              className="w-full py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#cdd6f4] transition-all flex items-center justify-center gap-1.5 border border-white/5"
            >
              <RotateCw size={12} className={runningComposer ? 'animate-spin' : ''} />
              Self Update Composer
            </button>
          ) : (
            <button
              onClick={handleInstallComposer}
              disabled={runningComposer}
              className="w-full py-1.5 rounded-xl text-xs font-bold bg-[#fab387]/20 hover:bg-[#fab387]/30 text-[#fab387] border border-[#fab387]/30 transition-all"
            >
              Cài Composer 1-Click
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-[#181825]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {selectedVersion ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-3.5 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#cba6f7]/10 text-[#cba6f7] border border-[#cba6f7]/20">
                  <Layers size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#cdd6f4]">PHP {selectedVersion} Runtime</h3>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        activePhpInfo?.fpmActive ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]' : 'bg-[#f38ba8]/20 text-[#f38ba8]'
                      }`}
                    >
                      php{selectedVersion}-fpm
                    </span>
                  </div>
                  <span className="text-[11px] text-[#585b70] font-mono">
                    FastCGI Socket: /run/php/php{selectedVersion}-fpm.sock
                  </span>
                </div>
              </div>

              {/* FPM Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleControlFpm('restart')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] text-xs font-semibold flex items-center gap-1.5 border border-[#89b4fa]/30 transition-all"
                  title="Khởi động lại PHP-FPM"
                >
                  <RotateCw size={12} /> Restart FPM
                </button>
                {activePhpInfo?.fpmActive ? (
                  <button
                    onClick={() => handleControlFpm('stop')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#f38ba8]/15 hover:bg-[#f38ba8]/25 text-[#f38ba8] text-xs font-semibold flex items-center gap-1.5 border border-[#f38ba8]/30 transition-all"
                  >
                    <Square size={12} /> Dừng
                  </button>
                ) : (
                  <button
                    onClick={() => handleControlFpm('start')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#a6e3a1]/15 hover:bg-[#a6e3a1]/25 text-[#a6e3a1] text-xs font-semibold flex items-center gap-1.5 border border-[#a6e3a1]/30 transition-all"
                  >
                    <Play size={12} /> Khởi động
                  </button>
                )}
              </div>
            </div>

            {/* Sub-tabs Header */}
            <div className="px-6 border-b border-white/[0.04] bg-[#181825] flex gap-6 text-xs font-semibold">
              {[
                { id: 'settings', label: 'Cấu hình php.ini (Trực quan)' },
                { id: 'extensions', label: 'Quản lý Extensions' },
                { id: 'raw_ini', label: 'Soạn thảo Raw INI' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`py-3 border-b-2 transition-all ${
                    activeSubTab === tab.id
                      ? 'border-[#cba6f7] text-[#cba6f7]'
                      : 'border-transparent text-[#a6adc8] hover:text-[#cdd6f4]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Visual php.ini Editor */}
            {activeSubTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                <div className="grid grid-cols-2 gap-5 max-w-3xl">
                  {/* Memory */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4] flex items-center gap-1.5">
                      <Cpu size={14} className="text-[#89b4fa]" /> memory_limit (Giới hạn RAM)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={memoryLimit}
                        onChange={(e) => setMemoryLimit(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
                      />
                      {['128M', '256M', '512M', '1024M'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMemoryLimit(val)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload Max */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4] flex items-center gap-1.5">
                      <Download size={14} className="text-[#a6e3a1]" /> upload_max_filesize (Upload Tối Đa)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={uploadMaxFilesize}
                        onChange={(e) => setUploadMaxFilesize(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
                      />
                      {['32M', '64M', '128M', '512M'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setUploadMaxFilesize(val)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Post Max */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4]">post_max_size (Dung Lượng POST)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={postMaxSize}
                        onChange={(e) => setPostMaxSize(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
                      />
                      {['64M', '128M', '512M'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPostMaxSize(val)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Execution Time */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4]">max_execution_time (Thời Gian Chạy - Giây)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maxExecutionTime}
                        onChange={(e) => setMaxExecutionTime(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
                      />
                      {['30', '60', '120', '300'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMaxExecutionTime(val)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                        >
                          {val}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Input Time */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4]">max_input_time (Thời Gian Nhận Input - Giây)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maxInputTime}
                        onChange={(e) => setMaxInputTime(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
                      />
                      {['30', '60', '120', '300'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMaxInputTime(val)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-[#a6adc8]"
                        >
                          {val}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Display Errors */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4]">display_errors (Hiển Thị Lỗi)</label>
                    <select
                      value={displayErrors}
                      onChange={(e) => setDisplayErrors(e.target.value)}
                      className="w-full bg-[#181825] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                    >
                      <option value="Off">Off (Khuyến nghị cho Production)</option>
                      <option value="On">On (Debug phát triển)</option>
                    </select>
                  </div>

                  {/* OPcache */}
                  <div className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] space-y-2">
                    <label className="text-xs font-bold text-[#cdd6f4] flex items-center gap-1.5">
                      <Zap size={14} className="text-[#fab387]" /> opcache.enable (Tăng Tốc Bytecode)
                    </label>
                    <select
                      value={opcacheEnabled}
                      onChange={(e) => setOpcacheEnabled(e.target.value)}
                      className="w-full bg-[#181825] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                    >
                      <option value="1">1 (Bật - Tối ưu tốc độ cao)</option>
                      <option value="0">0 (Tắt)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 max-w-3xl">
                  <button
                    onClick={handleSaveIniForm}
                    disabled={savingIni}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#cba6f7] to-[#89b4fa] text-[#11111b] text-xs font-bold hover:shadow-[0_0_20px_rgba(203,166,247,0.4)] active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2"
                  >
                    <CheckCircle size={14} />
                    {savingIni ? 'Đang lưu cấu hình & restart FPM...' : 'Lưu Cấu Hình & Áp Dụng Tức Thì'}
                  </button>
                </div>
              </div>
            )}

            {/* Extensions */}
            {activeSubTab === 'extensions' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
                <div className="grid grid-cols-2 gap-3.5 max-w-4xl">
                  {COMMON_EXTENSIONS.map((ext) => {
                    const isInstalled = installedExts.some((e) => e.includes(ext.pkg) || ext.name.toLowerCase().includes(e))
                    return (
                      <div
                        key={ext.pkg}
                        className="p-4 rounded-2xl bg-[#11111b]/40 border border-white/[0.06] flex items-center justify-between gap-3 hover:border-white/10 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-[#cdd6f4]">{ext.name}</h4>
                            {isInstalled && (
                              <span className="text-[9px] px-2 py-0.5 bg-[#a6e3a1]/20 text-[#a6e3a1] font-bold rounded-md flex items-center gap-1">
                                <Check size={10} /> Đã Cài
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#585b70] mt-1">{ext.desc}</p>
                        </div>

                        {!isInstalled && (
                          <button
                            onClick={() => handleInstallExtension(ext.pkg)}
                            disabled={loadingExts}
                            className="px-3.5 py-1.5 rounded-xl bg-[#cba6f7]/15 hover:bg-[#cba6f7]/25 text-[#cba6f7] text-xs font-semibold shrink-0 border border-[#cba6f7]/30 transition-all"
                          >
                            + Cài đặt
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Raw INI */}
            {activeSubTab === 'raw_ini' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#11111b]/30">
                <div className="p-3 bg-[#11111b]/60 border-b border-white/[0.04] flex justify-between items-center px-5">
                  <span className="text-xs text-[#585b70] font-mono">/etc/php/{selectedVersion}/fpm/php.ini</span>
                  <button
                    onClick={handleSaveRawIni}
                    disabled={savingIni}
                    className="px-5 py-1.5 rounded-xl bg-[#cba6f7] text-[#11111b] text-xs font-bold hover:bg-[#b4befe] active:scale-95 transition-all shadow-sm"
                  >
                    {savingIni ? 'Đang Lưu...' : 'Lưu File Raw INI'}
                  </button>
                </div>
                <textarea
                  value={rawIniContent}
                  onChange={(e) => setRawIniContent(e.target.value)}
                  className="flex-1 p-5 bg-[#11111b]/40 text-xs text-[#cdd6f4] outline-none font-mono resize-none leading-relaxed select-text"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
            <Sliders size={48} className="opacity-20 text-[#cba6f7] mb-2" />
            <span className="text-xs">Chọn một phiên bản PHP từ danh sách bên trái</span>
          </div>
        )}
      </div>

      {/* Install PHP Version Modal */}
      {showInstallPhpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={() => setShowInstallPhpModal(false)}
        >
          <div
            className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[480px] flex flex-col animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4] flex items-center gap-2">
                <Plus size={14} className="text-[#cba6f7]" /> Cài Đặt Thêm Phiên Bản PHP
              </h3>
              <button
                onClick={() => setShowInstallPhpModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-[#a6adc8] text-xs leading-relaxed">
                Hệ thống sẽ tự động thêm repository chính thức <code>ppa:ondrej/php</code> và cài đặt gói PHP-FPM kèm các module cốt lõi.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {['8.3', '8.2', '8.1', '8.0', '7.4'].map((v) => {
                  const already = phpVersions.some((p) => p.version === v)
                  return (
                    <button
                      key={v}
                      disabled={already || installingPhpVersion !== null}
                      onClick={() => handleInstallPhpVersion(v)}
                      className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-1 font-bold transition-all ${
                        already
                          ? 'bg-white/[0.02] border-white/5 text-[#585b70] cursor-not-allowed'
                          : 'bg-[#cba6f7]/10 border-[#cba6f7]/30 text-[#cba6f7] hover:bg-[#cba6f7]/20 active:scale-95 shadow-sm'
                      }`}
                    >
                      <span className="text-base">PHP {v}</span>
                      <span className="text-[10px] font-normal">
                        {already ? 'Đã cài đặt' : installingPhpVersion === v ? 'Đang cài...' : 'Bấm để cài đặt'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {actionLog && (
                <div className="space-y-1.5 pt-2">
                  <pre className="h-32 overflow-y-auto p-3 bg-[#11111b] rounded-xl font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
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
