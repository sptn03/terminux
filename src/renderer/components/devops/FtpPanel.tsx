import { useState, useEffect, useCallback } from 'react'
import {
  FolderTree,
  Plus,
  Trash2,
  X,
  RefreshCw,
  Lock,
  Unlock,
  Key,
  Power,
  Save,
  Server,
  Shield,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  Settings,
  FolderOpen,
  Wifi
} from 'lucide-react'
import RemotePathPicker from './RemotePathPicker'

type FtpEngine = 'vsftpd' | 'pure-ftpd' | 'proftpd' | 'none'

interface FtpAccount {
  username: string
  uid: string
  gid: string
  home: string
  shell: string
  locked: boolean
  inUserList: boolean
  homeSize: string
}

interface FtpPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

/** Splits a `===SECTION===` delimited shell output into named blocks. */
function parseSections(output: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  let current = ''
  for (const line of output.split('\n')) {
    const match = line.match(/^===([A-Z_]+)===\s*$/)
    if (match) {
      current = match[1]
      result[current] = []
      continue
    }
    if (current) result[current].push(line)
  }
  return result
}

function isFtpShell(shell: string): boolean {
  return /nologin|false|sync$/i.test(shell)
}

/** Sets `key=value` in an ini-style config, replacing the first match. */
function setConfigKey(content: string, key: string, value: string): string {
  const line = `${key}=${value}`
  const regex = new RegExp(`^\\s*#?\\s*${key}\\s*=.*$`, 'm')
  if (regex.test(content)) return content.replace(regex, line)
  return content.trimEnd() + '\n' + line + '\n'
}

function getConfigKey(content: string, key: string, fallback = ''): string {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'))
  return match ? match[1].trim() : fallback
}

export default function FtpPanel({ sessionId, exec, refreshKey, setLoading, setError }: FtpPanelProps) {
  const [engine, setEngine] = useState<FtpEngine>('none')
  const [serviceName, setServiceName] = useState('')
  const [serviceActive, setServiceActive] = useState(false)
  const [serverIp, setServerIp] = useState('')
  const [accounts, setAccounts] = useState<FtpAccount[]>([])
  const [configPath, setConfigPath] = useState('/etc/vsftpd.conf')
  const [configContent, setConfigContent] = useState('')
  const [configDirty, setConfigDirty] = useState(false)
  const [listeningPort, setListeningPort] = useState('21')
  const [subTab, setSubTab] = useState<'accounts' | 'config' | 'service'>('accounts')

  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')

  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<FtpAccount | null>(null)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formHome, setFormHome] = useState('')
  const [formWritable, setFormWritable] = useState(true)
  const [formSaving, setFormSaving] = useState(false)
  const [showPathPicker, setShowPathPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  const configFile =
    engine === 'pure-ftpd'
      ? '/etc/pure-ftpd/pure-ftpd.conf'
      : engine === 'proftpd'
        ? '/etc/proftpd/proftpd.conf'
        : '/etc/vsftpd.conf'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const script = [
        'echo "===ENGINE==="',
        'for e in vsftpd pure-ftpd proftpd; do command -v "$e" >/dev/null 2>&1 && echo "$e"; done',
        'echo "===SERVICE==="',
        'for s in vsftpd pure-ftpd proftpd; do echo "$s:$(systemctl is-active "$s" 2>/dev/null)"; done',
        'echo "===USERLIST==="',
        'sudo cat /etc/vsftpd.user_list /etc/vsftpd.userlist 2>/dev/null',
        'echo "===LOCKED==="',
        "sudo awk -F: '$2 ~ /^!/ { print $1 }' /etc/shadow 2>/dev/null",
        'echo "===USERS==="',
        'awk -F: \'$3 >= 1000 { print $1"|"$3"|"$4"|"$6"|"$7 }\' /etc/passwd',
        'echo "===IP==="',
        "hostname -I 2>/dev/null | awk '{print $1}'",
        'echo "===CONFIG_VSFTPD==="',
        'sudo cat /etc/vsftpd.conf 2>/dev/null',
        'echo "===CONFIG_PURE==="',
        'sudo cat /etc/pure-ftpd/pure-ftpd.conf 2>/dev/null',
        'echo "===CONFIG_PROFTPD==="',
        'sudo cat /etc/proftpd/proftpd.conf 2>/dev/null'
      ].join('\n')

      const { stdout } = await exec(script)
      const sections = parseSections(stdout)

      const detected = (sections.ENGINE || []).map((l) => l.trim()).filter(Boolean)
      const detectedEngine: FtpEngine = detected.includes('vsftpd')
        ? 'vsftpd'
        : detected.includes('pure-ftpd')
          ? 'pure-ftpd'
          : detected.includes('proftpd')
            ? 'proftpd'
            : 'none'
      setEngine(detectedEngine)

      let active = false
      let activeName = ''
      for (const line of sections.SERVICE || []) {
        const [name, state] = line.split(':')
        if (name && state?.trim() === 'active') {
          active = true
          activeName = name.trim()
        }
      }
      setServiceActive(active)
      setServiceName(activeName || (detectedEngine === 'none' ? '' : detectedEngine))

      setServerIp((sections.IP || []).join('').trim())

      const config = (
        detectedEngine === 'pure-ftpd'
          ? sections.CONFIG_PURE
          : detectedEngine === 'proftpd'
            ? sections.CONFIG_PROFTPD
            : sections.CONFIG_VSFTPD
      ) || []
      const configText = config.join('\n')
      setConfigContent(configText)
      setConfigDirty(false)
      if (configText) setListeningPort(getConfigKey(configText, 'listen_port', '21'))

      const userList = new Set(
        (sections.USERLIST || []).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      )
      const lockedUsers = new Set((sections.LOCKED || []).map((l) => l.trim()).filter(Boolean))

      const parsed: FtpAccount[] = (sections.USERS || [])
        .map((line) => line.split('|'))
        .filter((parts) => parts.length === 5)
        .map(([username, uid, gid, home, shell]) => ({
          username,
          uid,
          gid,
          home,
          shell,
          locked: lockedUsers.has(username),
          inUserList: userList.has(username),
          homeSize: '-'
        }))

      // Tài khoản FTP: có trong userlist, shell không đăng nhập được, hoặc home trong /var/www
      const ftpAccounts = parsed.filter((u) => u.inUserList || isFtpShell(u.shell) || u.home.startsWith('/var/www'))

      const sized = await Promise.all(
        ftpAccounts.slice(0, 20).map(async (account) => {
          const res = await exec(`sudo du -sh "${account.home}" 2>/dev/null | awk '{print $1}'`)
          return { username: account.username, size: res.stdout.trim() || '-' }
        })
      )
      const sizeMap = new Map(sized.map((s) => [s.username, s.size]))
      setAccounts(ftpAccounts.map((a) => ({ ...a, homeSize: sizeMap.get(a.username) || '-' })))
    } catch (e: any) {
      setError(e.message || 'Lỗi tải trạng thái FTP')
    } finally {
      setLoading(false)
    }
  }, [exec, setLoading, setError])

  // The config path follows the detected engine.
  useEffect(() => {
    setConfigPath(configFile)
  }, [configFile])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  /** base64 keeps passwords/config free of shell quoting problems. */
  const toBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }

  const restartService = async (name: string) => {
    await exec(`sudo systemctl restart ${name} 2>/dev/null`)
    await exec(`sudo systemctl enable ${name} 2>/dev/null`)
  }

  const handleInstall = async () => {
    setInstalling(true)
    setInstallLog('Bắt đầu cài đặt vsftpd...\n')
    try {
      setInstallLog((prev) => prev + 'Cập nhật danh sách gói (apt-get update)...\n')
      await exec('sudo apt-get update')

      setInstallLog((prev) => prev + 'Cài đặt vsftpd...\n')
      const res = await exec('sudo DEBIAN_FRONTEND=noninteractive apt-get install -y vsftpd')
      if (res.code !== 0) throw new Error(res.stderr || 'apt-get install thất bại')

      setInstallLog((prev) => prev + 'Ghi cấu hình mặc định an toàn...\n')
      const current = await exec('sudo cat /etc/vsftpd.conf 2>/dev/null')
      let cfg = current.stdout || ''
      cfg = setConfigKey(cfg, 'listen_port', '21')
      cfg = setConfigKey(cfg, 'local_enable', 'YES')
      cfg = setConfigKey(cfg, 'write_enable', 'YES')
      cfg = setConfigKey(cfg, 'chroot_local_user', 'YES')
      cfg = setConfigKey(cfg, 'allow_writeable_chroot', 'YES')
      cfg = setConfigKey(cfg, 'userlist_enable', 'YES')
      cfg = setConfigKey(cfg, 'userlist_deny', 'NO')
      cfg = setConfigKey(cfg, 'userlist_file', '/etc/vsftpd.user_list')
      cfg = setConfigKey(cfg, 'pasv_enable', 'YES')
      cfg = setConfigKey(cfg, 'pasv_min_port', '30000')
      cfg = setConfigKey(cfg, 'pasv_max_port', '30100')

      await exec(`echo '${toBase64(cfg)}' | base64 -d | sudo tee /etc/vsftpd.conf > /dev/null`)
      await exec('sudo touch /etc/vsftpd.user_list && sudo chmod 600 /etc/vsftpd.user_list')

      setInstallLog((prev) => prev + 'Khởi động dịch vụ...\n')
      await restartService('vsftpd')

      setInstallLog((prev) => prev + 'Hoàn tất!\n')
      await refresh()
    } catch (e: any) {
      setInstallLog((prev) => prev + `Lỗi: ${e.message}\n`)
      setError('Cài đặt FTP thất bại: ' + e.message)
    } finally {
      setInstalling(false)
    }
  }

  const handleToggleService = async () => {
    if (!serviceName) return
    setBusy(true)
    try {
      const res = serviceActive
        ? await exec(`sudo systemctl stop ${serviceName}`)
        : await exec(`sudo systemctl start ${serviceName}`)
      if (res.code !== 0) alert('Lỗi: ' + (res.stderr || res.stdout))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const openCreateAccount = () => {
    setEditingAccount(null)
    setFormUsername('')
    setFormPassword('')
    setFormHome('')
    setFormWritable(true)
    setShowAccountModal(true)
  }

  const openPasswordModal = (account: FtpAccount) => {
    setEditingAccount(account)
    setFormUsername(account.username)
    setFormPassword('')
    setFormHome(account.home)
    setFormWritable(true)
    setShowAccountModal(true)
  }

  const handleSaveAccount = async () => {
    const username = formUsername.trim()
    if (!username) return alert('Vui lòng nhập tên đăng nhập!')
    if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(username)) {
      return alert('Tên đăng nhập chỉ gồm chữ, số, gạch dưới/gạch ngang (tối đa 32 ký tự).')
    }
    if (!editingAccount && formPassword.length < 6) {
      return alert('Mật khẩu cần tối thiểu 6 ký tự!')
    }
    if (formPassword.includes(':') || formPassword.includes('\n')) {
      return alert('Mật khẩu không được chứa dấu ":" hoặc xuống dòng.')
    }

    setFormSaving(true)
    try {
      if (editingAccount) {
        if (formPassword) {
          const res = await exec(
            `echo '${toBase64(`${username}:${formPassword}`)}' | base64 -d | sudo chpasswd`
          )
          if (res.code !== 0) throw new Error(res.stderr || 'Không đổi được mật khẩu')
        }
      } else {
        const home = formHome.trim() || `/var/www/${username}`
        const script = [
          `if id "${username}" >/dev/null 2>&1; then`,
          `  sudo usermod -d "${home}" -s /usr/sbin/nologin "${username}"`,
          'else',
          `  sudo useradd -d "${home}" -s /usr/sbin/nologin -m "${username}"`,
          'fi',
          `sudo mkdir -p "${home}"`,
          `sudo chown "${username}":"${username}" "${home}"`,
          `echo '${toBase64(`${username}:${formPassword}`)}' | base64 -d | sudo chpasswd`
        ].join('\n')

        const res = await exec(script)
        if (res.code !== 0) throw new Error(res.stderr || 'Không tạo được tài khoản')

        // vsftpd: chỉ cho phép user nằm trong userlist
        await exec(
          [
            'if [ -f /etc/vsftpd.user_list ]; then',
            `  grep -qx "${username}" /etc/vsftpd.user_list || echo "${username}" | sudo tee -a /etc/vsftpd.user_list > /dev/null`,
            'fi'
          ].join('\n')
        )
      }

      // Quyền ghi: home phải thuộc user và không bị khoá ghi
      const home = formHome.trim() || `/var/www/${username}`
      await exec(`sudo chown "${username}":"${username}" "${home}" 2>/dev/null`)
      await exec(`sudo chmod ${formWritable ? 'u+rwx' : 'a-w'} "${home}" 2>/dev/null`)

      if (serviceName) await restartService(serviceName)

      setShowAccountModal(false)
      await refresh()
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setFormSaving(false)
    }
  }

  const handleDeleteAccount = async (account: FtpAccount) => {
    const removeHome = confirm(
      `Xóa tài khoản FTP "${account.username}"?\n\n` +
        `Bấm OK: xóa cả thư mục ${account.home}\nBấm Cancel: giữ lại thư mục`
    )
    const keepHome = !removeHome
    if (!confirm(`Xác nhận xóa vĩnh viễn tài khoản "${account.username}"?`)) return

    setBusy(true)
    try {
      const script = [
        `sudo deluser "${account.username}" 2>/dev/null || sudo userdel "${account.username}" 2>/dev/null`,
        keepHome ? 'true' : `sudo rm -rf "${account.home}"`,
        'if [ -f /etc/vsftpd.user_list ]; then',
        `  sudo sed -i "/^${account.username}$/d" /etc/vsftpd.user_list`,
        'fi'
      ].join('\n')
      const res = await exec(script)
      if (res.code !== 0) alert('Cảnh báo: ' + (res.stderr || 'có lỗi khi xóa'))
      if (serviceName) await restartService(serviceName)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleToggleLock = async (account: FtpAccount) => {
    setBusy(true)
    try {
      const res = await exec(
        account.locked
          ? `sudo usermod -U "${account.username}"`
          : `sudo usermod -L "${account.username}"`
      )
      if (res.code !== 0) alert('Lỗi: ' + (res.stderr || res.stdout))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!configContent.trim()) return alert('Nội dung cấu hình đang trống!')
    setBusy(true)
    try {
      const res = await exec(
        `echo '${toBase64(configContent)}' | base64 -d | sudo tee ${configPath} > /dev/null`
      )
      if (res.code !== 0) throw new Error(res.stderr || 'Không ghi được file cấu hình')

      if (serviceName) {
        const restart = await exec(`sudo systemctl restart ${serviceName}`)
        if (restart.code !== 0) {
          alert('Cấu hình đã lưu nhưng dịch vụ không khởi động lại được:\n' + (restart.stderr || restart.stdout))
        }
      }
      setConfigDirty(false)
      await refresh()
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  /** Quick toggles for the vsftpd options that matter for hosting. */
  const applySetting = (key: string, value: string) => {
    setConfigContent((prev) => setConfigKey(prev, key, value))
    setConfigDirty(true)
  }

  const handleOpenFirewall = async () => {
    setBusy(true)
    try {
      const hasUfw = await exec('command -v ufw >/dev/null 2>&1 && echo yes')
      if (!hasUfw.stdout.includes('yes')) {
        return alert('Máy chủ không có UFW. Hãy mở cổng 21 và dải passive port bằng tường lửa của bạn.')
      }
      const min = getConfigKey(configContent, 'pasv_min_port', '30000')
      const max = getConfigKey(configContent, 'pasv_max_port', '30100')
      await exec(`sudo ufw allow ${listeningPort}/tcp`)
      await exec(`sudo ufw allow ${min}:${max}/tcp`)
      alert(`Đã mở cổng ${listeningPort}/tcp và dải passive ${min}:${max}/tcp trên UFW.`)
    } finally {
      setBusy(false)
    }
  }

  const recommendedSettings: [string, string][] = [
    ['local_enable', 'YES'],
    ['write_enable', 'YES'],
    ['chroot_local_user', 'YES'],
    ['allow_writeable_chroot', 'YES'],
    ['userlist_enable', 'YES'],
    ['userlist_deny', 'NO'],
    ['userlist_file', '/etc/vsftpd.user_list'],
    ['pasv_enable', 'YES'],
    ['pasv_min_port', '30000'],
    ['pasv_max_port', '30100']
  ]

  const activeSetting = (key: string, fallback = '') => getConfigKey(configContent, key, fallback)

  const renderToggle = (label: string, key: string, onValue: string, offValue: string, hint?: string) => {
    const current = activeSetting(key)
    const isOn = current.toUpperCase() === onValue.toUpperCase()
    return (
      <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.03]">
        <div className="min-w-0">
          <div className="text-xs text-[#cdd6f4] font-medium">{label}</div>
          <div className="text-[10px] text-[#585b70] font-mono truncate">
            {key}={current || '(mặc định)'}
            {hint ? ` — ${hint}` : ''}
          </div>
        </div>
        <button
          onClick={() => applySetting(key, isOn ? offValue : onValue)}
          className={`px-3 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
            isOn
              ? 'bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30'
              : 'bg-white/5 text-[#585b70] border border-white/10'
          }`}
        >
          {isOn ? 'BẬT' : 'TẮT'}
        </button>
      </div>
    )
  }

  // Chưa có FTP server → màn hình cài đặt
  if (engine === 'none') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-lg mx-auto p-6 text-center space-y-4">
        <FolderTree size={48} className="text-[#89b4fa] opacity-60 animate-bounce" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[#cdd6f4]">Chưa có FTP server trên máy chủ</h3>
          <p className="text-xs text-[#585b70]">
            Không tìm thấy vsftpd / pure-ftpd / proftpd. Cài vsftpd tự động để bắt đầu quản lý tài khoản FTP.
          </p>
        </div>

        {installing ? (
          <div className="w-full bg-[#181825] border border-white/5 rounded-xl p-4 flex flex-col text-left space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#89b4fa] tracking-wider animate-pulse flex items-center gap-1.5">
              <RefreshCw size={11} className="animate-spin" /> Đang cài đặt vsftpd...
            </span>
            <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[9px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
              {installLog}
            </pre>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
          >
            Cài đặt vsftpd tự động
          </button>
        )}
      </div>
    )
  }

  const passiveMin = activeSetting('pasv_min_port', '30000')
  const passiveMax = activeSetting('pasv_max_port', '30100')
  const chrootOn = activeSetting('chroot_local_user').toUpperCase() === 'YES'
  const writeOn = activeSetting('write_enable').toUpperCase() === 'YES'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Trạng thái + điều khiển dịch vụ */}
      <div className="flex flex-wrap items-center gap-3 bg-[#181825] border border-white/[0.04] rounded-xl p-3 mb-3 shrink-0">
        <div className={`p-2 rounded-lg ${serviceActive ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'}`}>
          <Shield size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#cdd6f4]">
            {engine} · {serviceActive ? 'Đang chạy' : 'Đang dừng'}
          </div>
          <div className="text-[10px] text-[#585b70] font-mono truncate">
            {serverIp || 'không rõ IP'}:{listeningPort} · PASV {passiveMin}-{passiveMax}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-[#a6adc8]">
            {accounts.length} tài khoản
          </span>
          <span className={`text-[10px] px-2 py-1 rounded-lg ${chrootOn ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f9e2af]/10 text-[#f9e2af]'}`}>
            chroot {chrootOn ? 'BẬT' : 'TẮT'}
          </span>
          <span className={`text-[10px] px-2 py-1 rounded-lg ${writeOn ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'}`}>
            ghi {writeOn ? 'BẬT' : 'TẮT'}
          </span>
          <button
            onClick={handleToggleService}
            disabled={busy}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${
              serviceActive
                ? 'bg-[#f38ba8]/15 text-[#f38ba8] hover:bg-[#f38ba8]/25'
                : 'bg-[#a6e3a1]/15 text-[#a6e3a1] hover:bg-[#a6e3a1]/25'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Power size={11} /> {serviceActive ? 'Dừng dịch vụ' : 'Khởi động'}
            </span>
          </button>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 mb-3 shrink-0">
        {(
          [
            ['accounts', `Tài khoản (${accounts.length})`, FolderTree],
            ['config', 'Cấu hình', Settings],
            ['service', 'Kết nối & Firewall', Wifi]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === id ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
            }`}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {subTab === 'accounts' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="text-[10px] text-[#585b70]">
              Tài khoản FTP là user hệ thống dùng shell không đăng nhập được (nologin), bị giới hạn trong thư mục nhà.
            </div>
            <button
              onClick={openCreateAccount}
              className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] flex items-center gap-1.5 shrink-0 ml-3"
            >
              <Plus size={12} /> Tạo tài khoản
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 pr-1">
            {accounts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-[#45475a] gap-2">
                <FolderTree size={32} className="opacity-40" />
                <span className="text-xs">Chưa có tài khoản FTP nào. Bấm "Tạo tài khoản" để bắt đầu.</span>
              </div>
            )}

            {accounts.map((account) => (
              <div
                key={account.username}
                className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 flex flex-wrap items-center gap-3"
              >
                <div className={`p-2 rounded-lg ${account.locked ? 'bg-[#f38ba8]/10 text-[#f38ba8]' : 'bg-[#89b4fa]/10 text-[#89b4fa]'}`}>
                  <HardDrive size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#cdd6f4] font-mono">{account.username}</span>
                    {account.locked && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f38ba8]/15 text-[#f38ba8] font-bold">ĐÃ KHOÁ</span>
                    )}
                    {account.inUserList && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#a6e3a1]/15 text-[#a6e3a1] font-bold">TRONG USERLIST</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#585b70] font-mono truncate">
                    {account.home} · uid {account.uid} · {account.homeSize}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openPasswordModal(account)}
                    disabled={busy}
                    title="Đổi mật khẩu"
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40"
                  >
                    <Key size={12} />
                  </button>
                  <button
                    onClick={() => handleToggleLock(account)}
                    disabled={busy}
                    title={account.locked ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}
                    className={`p-2 rounded-lg disabled:opacity-40 ${
                      account.locked ? 'bg-[#a6e3a1]/10 hover:bg-[#a6e3a1]/20 text-[#a6e3a1]' : 'bg-[#f9e2af]/10 hover:bg-[#f9e2af]/20 text-[#f9e2af]'
                    }`}
                  >
                    {account.locked ? <Unlock size={12} /> : <Lock size={12} />}
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account)}
                    disabled={busy}
                    title="Xóa tài khoản"
                    className="p-2 rounded-lg bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#f38ba8] disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'config' && (
        <div className="flex-1 flex flex-col overflow-hidden gap-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0">
            <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
                  <Settings size={11} /> Tuỳ chọn nhanh
                </span>
                <button
                  onClick={() => {
                    let cfg = configContent
                    for (const [key, value] of recommendedSettings) cfg = setConfigKey(cfg, key, value)
                    setConfigContent(cfg)
                    setConfigDirty(true)
                  }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-[#cba6f7]/15 text-[#cba6f7] hover:bg-[#cba6f7]/25 font-semibold"
                >
                  Áp dụng khuyến nghị
                </button>
              </div>

              {renderToggle('Cho phép user hệ thống đăng nhập', 'local_enable', 'YES', 'NO')}
              {renderToggle('Cho phép ghi (upload/sửa/xoá)', 'write_enable', 'YES', 'NO')}
              {renderToggle('Giới hạn trong thư mục nhà (chroot)', 'chroot_local_user', 'YES', 'NO')}
              {renderToggle('Cho phép chroot thư mục ghi được', 'allow_writeable_chroot', 'YES', 'NO', 'bắt buộc khi chroot + ghi')}
              {renderToggle('Bật danh sách user được phép', 'userlist_enable', 'YES', 'NO')}
              {renderToggle('Bật chế độ passive', 'pasv_enable', 'YES', 'NO')}
              {renderToggle('Cho phép anonymous', 'anonymous_enable', 'YES', 'NO', 'không nên bật')}
            </div>

            <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] font-mono">
                  {configPath}
                </span>
                <div className="flex items-center gap-2">
                  {configDirty && (
                    <span className="text-[10px] text-[#f9e2af] flex items-center gap-1">
                      <AlertTriangle size={10} /> có thay đổi chưa lưu
                    </span>
                  )}
                  <button
                    onClick={handleSaveConfig}
                    disabled={busy || !configDirty}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-[#89b4fa] text-[#1e1e2e] font-bold hover:bg-[#74c7ec] disabled:opacity-40 flex items-center gap-1"
                  >
                    <Save size={10} /> Lưu & khởi động lại
                  </button>
                </div>
              </div>
              <textarea
                value={configContent}
                onChange={(e) => {
                  setConfigContent(e.target.value)
                  setConfigDirty(true)
                }}
                spellCheck={false}
                className="flex-1 min-h-[260px] bg-[#11111b] border border-white/5 rounded-lg p-3 text-[10px] font-mono text-[#cdd6f4] outline-none resize-none scrollbar-thin select-text"
              />
            </div>
          </div>
        </div>
      )}

      {subTab === 'service' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
                <Server size={11} /> Thông tin kết nối
              </span>
              {[
                ['Máy chủ (Host)', serverIp || '—'],
                ['Cổng (Port)', listeningPort],
                ['Giao thức', 'FTP (thêm FTPS nếu cần TLS)'],
                ['Passive ports', `${passiveMin} - ${passiveMax}`],
                ['Dịch vụ', `${serviceName || engine} (${serviceActive ? 'đang chạy' : 'đang dừng'})`]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs border-b border-white/[0.03] pb-1.5">
                  <span className="text-[#585b70]">{label}</span>
                  <span className="text-[#cdd6f4] font-mono truncate">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
                <Shield size={11} /> Cổng & tường lửa
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-[#585b70] space-y-1 block">
                  Cổng FTP
                  <input
                    type="number"
                    value={listeningPort}
                    onChange={(e) => setListeningPort(e.target.value)}
                    className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none"
                  />
                </label>
                <div className="text-[10px] text-[#585b70] space-y-1">
                  Dải passive (min-max)
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={passiveMin}
                      onChange={(e) => applySetting('pasv_min_port', e.target.value)}
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none"
                    />
                    <span className="text-[#585b70]">-</span>
                    <input
                      type="number"
                      value={passiveMax}
                      onChange={(e) => applySetting('pasv_max_port', e.target.value)}
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => applySetting('listen_port', listeningPort)}
                className="w-full py-1.5 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/10 text-[#a6adc8]"
              >
                Ghi cổng vào cấu hình (nhớ bấm Lưu)
              </button>
              <button
                onClick={handleOpenFirewall}
                disabled={busy}
                className="w-full py-1.5 rounded-lg text-xs font-bold bg-[#fab387]/15 hover:bg-[#fab387]/25 text-[#fab387] border border-[#fab387]/30 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <Wifi size={11} /> Mở cổng {listeningPort} + passive trên UFW
              </button>
              <p className="text-[10px] text-[#45475a] leading-relaxed">
                Máy khách cần mở cả cổng điều khiển và dải passive. Nếu máy chủ sau NAT/cloud, khai báo thêm
                <code className="text-[#89b4fa]"> pasv_address</code> bằng IP public.
              </p>
            </div>
          </div>

          <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
              <CheckCircle size={11} /> Gợi ý vận hành
            </span>
            <ul className="text-[10px] text-[#585b70] space-y-1 list-disc pl-4">
              <li>
                Tài khoản FTP dùng shell <code className="text-[#89b4fa]">/usr/sbin/nologin</code> nên không SSH/SFTP được — chỉ FTP.
              </li>
              <li>Muốn upload qua SFTP (cổng 22) thì dùng user hệ thống có shell thật (xem panel System Users).</li>
              <li>
                Bật TLS: thêm <code className="text-[#89b4fa]">ssl_enable=YES</code> + chứng chỉ trong tab Cấu hình, sau đó dùng FTPS.
              </li>
              <li>Dùng passive port cố định để mở tường lửa đơn giản hơn.</li>
            </ul>
          </div>
        </div>
      )}

      {showAccountModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !formSaving && setShowAccountModal(false)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Key size={12} />
                {editingAccount ? `Đổi mật khẩu: ${editingAccount.username}` : 'Tạo tài khoản FTP'}
              </h3>
              <button
                onClick={() => setShowAccountModal(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên đăng nhập *</label>
                <input
                  type="text"
                  autoFocus={!editingAccount}
                  disabled={!!editingAccount || formSaving}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="ví dụ: webuser01"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono disabled:opacity-60 select-text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">
                  Mật khẩu {editingAccount ? '(để trống nếu không đổi)' : '*'}
                </label>
                <input
                  type="password"
                  autoFocus={!!editingAccount}
                  disabled={formSaving}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="tối thiểu 6 ký tự"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                />
              </div>

              {!editingAccount && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[#585b70] font-semibold">Thư mục nhà (home)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={formSaving}
                        value={formHome}
                        onChange={(e) => setFormHome(e.target.value)}
                        placeholder={`/var/www/${formUsername || 'user'}`}
                        className="flex-1 min-w-0 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      />
                      <button
                        onClick={() => setShowPathPicker(true)}
                        className="px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] shrink-0"
                        title="Duyệt thư mục trên server"
                      >
                        <FolderOpen size={13} />
                      </button>
                    </div>
                    <p className="text-[10px] text-[#45475a]">Bỏ trống sẽ dùng /var/www/&lt;username&gt;</p>
                  </div>

                  <label className="flex items-center gap-2 text-[#a6adc8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formWritable}
                      onChange={(e) => setFormWritable(e.target.checked)}
                      className="accent-[#89b4fa]"
                    />
                    Cho phép ghi vào thư mục nhà (upload)
                  </label>
                </>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowAccountModal(false)}
                  disabled={formSaving}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-40"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveAccount}
                  disabled={formSaving}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] disabled:opacity-40"
                >
                  {formSaving ? 'Đang lưu...' : editingAccount ? 'Đổi mật khẩu' : 'Tạo tài khoản'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RemotePathPicker
        visible={showPathPicker}
        mode="dir"
        exec={exec}
        startPath="/var/www"
        title="Chọn thư mục nhà cho tài khoản FTP"
        onClose={() => setShowPathPicker(false)}
        onSelect={(path) => {
          setFormHome(path)
          setShowPathPicker(false)
        }}
      />
    </div>
  )
}
