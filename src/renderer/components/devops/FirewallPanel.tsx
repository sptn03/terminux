import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  ShieldAlert,
  ShieldOff,
  Plus,
  Trash2,
  RefreshCw,
  Power,
  X,
  Save,
  AlertTriangle,
  Ban,
  Unlock,
  Terminal,
  Activity
} from 'lucide-react'

type FirewallEngine = 'ufw' | 'firewalld' | 'nftables' | 'iptables' | 'none'

interface UfwRule {
  num: string
  to: string
  action: string
  from: string
}

interface IptablesRule {
  num: string
  chain: string
  target: string
  prot: string
  source: string
  destination: string
  extra: string
}

interface FirewalldInfo {
  running: boolean
  defaultZone: string
  activeZones: { name: string; interfaces: string }[]
  services: string[]
  ports: string[]
  richRules: string[]
}

interface Fail2banJail {
  name: string
  currentlyBanned: string
  totalBanned: string
  bannedIps: string[]
}

interface FirewallPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

function parseSections(output: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  let current = ''
  for (const line of output.split('\n')) {
    const match = line.match(/^===([A-Z0-9_]+)===\s*$/)
    if (match) {
      current = match[1]
      result[current] = []
      continue
    }
    if (current) result[current].push(line)
  }
  return result
}

/** Các service phổ biến để thêm nhanh vào firewalld. */
const COMMON_SERVICES = [
  'ssh',
  'http',
  'https',
  'ftp',
  'smtp',
  'smtps',
  'imap',
  'imaps',
  'pop3',
  'pop3s',
  'dns',
  'mysql',
  'postgresql',
  'redis',
  'mongodb',
  'docker-registry'
]

export default function FirewallPanel({ exec, refreshKey, setLoading, setError }: FirewallPanelProps) {
  const [engine, setEngine] = useState<FirewallEngine>('none')
  const [availableEngines, setAvailableEngines] = useState<FirewallEngine[]>([])
  const [active, setActive] = useState(false)

  // UFW
  const [ufwRules, setUfwRules] = useState<UfwRule[]>([])
  const [defaultIncoming, setDefaultIncoming] = useState('')
  const [defaultOutgoing, setDefaultOutgoing] = useState('')

  // firewalld
  const [firewalld, setFirewalld] = useState<FirewalldInfo>({
    running: false,
    defaultZone: '',
    activeZones: [],
    services: [],
    ports: [],
    richRules: []
  })

  // iptables / nftables
  const [iptablesRules, setIptablesRules] = useState<IptablesRule[]>([])
  const [nftRuleset, setNftRuleset] = useState('')

  // fail2ban
  const [fail2banInstalled, setFail2banInstalled] = useState(false)
  const [jails, setJails] = useState<Fail2banJail[]>([])
  const [banTarget, setBanTarget] = useState<{ jail: string; ip: string } | null>(null)

  const [subTab, setSubTab] = useState<'overview' | 'rules' | 'fail2ban' | 'logs'>('overview')
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [busy, setBusy] = useState(false)

  // Add-rule form
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPort, setNewPort] = useState('')
  const [newProto, setNewProto] = useState<'tcp' | 'udp'>('tcp')
  const [newAction, setNewAction] = useState<'allow' | 'deny'>('allow')
  const [newSource, setNewSource] = useState('')
  const [newZone, setNewZone] = useState('')
  const [newService, setNewService] = useState('')

  const fetchFirewall = useCallback(async () => {
    setError('')
    try {
      const script = [
        'echo "===ENGINES==="',
        'for e in ufw firewall-cmd nft iptables; do command -v "$e" >/dev/null 2>&1 && echo "$e"; done',
        'echo "===UFW_STATUS==="',
        'sudo ufw status numbered 2>/dev/null',
        'echo "===UFW_DEFAULTS==="',
        'sudo grep -E "^DEFAULT_(INPUT|OUTPUT)_POLICY" /etc/default/ufw 2>/dev/null',
        'echo "===FIREWALLD_STATE==="',
        'sudo firewall-cmd --state 2>/dev/null',
        'echo "===FIREWALLD_DEFAULT_ZONE==="',
        'sudo firewall-cmd --get-default-zone 2>/dev/null',
        'echo "===FIREWALLD_ACTIVE_ZONES==="',
        'sudo firewall-cmd --get-active-zones 2>/dev/null',
        'echo "===FIREWALLD_LIST==="',
        'sudo firewall-cmd --list-all 2>/dev/null',
        'echo "===IPTABLES==="',
        'sudo iptables -L INPUT -n -v --line-numbers 2>/dev/null',
        'echo "===NFTABLES==="',
        'sudo nft list ruleset 2>/dev/null',
        'echo "===F2B_INSTALLED==="',
        'command -v fail2ban-client >/dev/null 2>&1 && echo yes',
        'echo "===F2B_JAILS==="',
        'sudo fail2ban-client status 2>/dev/null',
        'echo "===F2B_DETAIL==="',
        'for j in $(sudo fail2ban-client status 2>/dev/null | grep "Jail list" | cut -d: -f2 | tr -d " " | tr "," " "); do',
        '  echo "JAIL:$j"',
        '  sudo fail2ban-client status "$j" 2>/dev/null | grep -E "Currently banned|Total banned|Banned IP list"',
        'done'
      ].join('\n')

      const { stdout } = await exec(script)
      const s = parseSections(stdout)

      const engines = (s.ENGINES || []).map((l) => l.trim()).filter(Boolean)
      const detected: FirewallEngine[] = []
      if (engines.includes('ufw')) detected.push('ufw')
      if (engines.includes('firewall-cmd')) detected.push('firewalld')
      if (engines.includes('nft')) detected.push('nftables')
      if (engines.includes('iptables')) detected.push('iptables')
      setAvailableEngines(detected)

      const ufwStatus = (s.UFW_STATUS || []).join('\n')
      const ufwRunning = /Status:\s*active/i.test(ufwStatus)
      const firewalldRunning = (s.FIREWALLD_STATE || []).join('').trim() === 'running'
      const nftRules = (s.NFTABLES || []).join('\n').trim()
      const iptablesLines = (s.IPTABLES || []).filter(Boolean)

      // Ưu tiên engine đang thực sự hoạt động
      const running: FirewallEngine = ufwRunning
        ? 'ufw'
        : firewalldRunning
          ? 'firewalld'
          : nftRules
            ? 'nftables'
            : iptablesLines.length > 1
              ? 'iptables'
              : detected[0] || 'none'
      setEngine(running)
      setActive(ufwRunning || firewalldRunning || (running === 'iptables' && iptablesLines.length > 0))

      const rules: UfwRule[] = []
      const ruleRegex = /^\[\s*(\d+)\]\s+(\S+)\s+([A-Za-z]+)(?:\s+(IN|OUT))?\s+(.+)$/
      for (const line of s.UFW_STATUS || []) {
        const match = line.trim().match(ruleRegex)
        if (match) {
          rules.push({ num: match[1], to: match[2], action: match[3].toUpperCase(), from: match[5].trim() })
        }
      }
      setUfwRules(rules)

      for (const line of s.UFW_DEFAULTS || []) {
        if (line.startsWith('DEFAULT_INPUT_POLICY')) setDefaultIncoming(line.split('=')[1]?.trim() || '')
        if (line.startsWith('DEFAULT_OUTPUT_POLICY')) setDefaultOutgoing(line.split('=')[1]?.trim() || '')
      }

      // firewalld
      const listLines = s.FIREWALLD_LIST || []
      const zones: { name: string; interfaces: string }[] = []
      const activeZoneLines = s.FIREWALLD_ACTIVE_ZONES || []
      for (let i = 0; i < activeZoneLines.length; i++) {
        const name = activeZoneLines[i]
        if (!name || /^\s/.test(name) || !name.trim()) continue
        const interfacesLine = activeZoneLines[i + 1] || ''
        const ifaceMatch = interfacesLine.match(/interfaces:\s*(.*)$/)
        zones.push({ name: name.trim(), interfaces: ifaceMatch ? ifaceMatch[1].trim() : '' })
      }

      const pick = (prefix: string): string[] => {
        const line = listLines.find((l) => l.trim().startsWith(prefix))
        if (!line) return []
        const value = line.split(':').slice(1).join(':').trim()
        return value ? value.split(/\s+/).filter(Boolean) : []
      }

      setFirewalld({
        running: firewalldRunning,
        defaultZone: (s.FIREWALLD_DEFAULT_ZONE || []).join('').trim(),
        activeZones: zones,
        services: pick('services:'),
        ports: pick('ports:'),
        richRules: listLines
          .filter((l) => l.trim().startsWith('rich rules:'))
          .map((l) => l.split(':').slice(1).join(':').trim())
          .filter(Boolean)
      })

      // iptables
      const parsedIptables: IptablesRule[] = []
      for (const line of s.IPTABLES || []) {
        const match = line.match(
          /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/
        )
        if (match) {
          parsedIptables.push({
            num: match[1],
            chain: 'INPUT',
            target: match[4],
            prot: match[5],
            source: match[9],
            destination: match[10],
            extra: match[11].trim()
          })
        }
      }
      setIptablesRules(parsedIptables)
      setNftRuleset(nftRules)

      // fail2ban
      const installed = (s.F2B_INSTALLED || []).join('').trim() === 'yes'
      setFail2banInstalled(installed)
      if (installed) {
        const parsedJails: Fail2banJail[] = []
        let current: Fail2banJail | null = null
        for (const line of s.F2B_DETAIL || []) {
          const jailMatch = line.match(/^JAIL:(\S+)/)
          if (jailMatch) {
            current = { name: jailMatch[1], currentlyBanned: '0', totalBanned: '0', bannedIps: [] }
            parsedJails.push(current)
            continue
          }
          if (!current) continue
          const currently = line.match(/Currently banned:\s*(\d+)/)
          if (currently) current.currentlyBanned = currently[1]
          const total = line.match(/Total banned:\s*(\d+)/)
          if (total) current.totalBanned = total[1]
          const ips = line.match(/Banned IP list:\s*(.*)$/)
          if (ips) current.bannedIps = ips[1].split(/\s+/).filter(Boolean)
        }
        setJails(parsedJails)
      } else {
        setJails([])
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi tải cấu hình tường lửa')
    }
  }, [exec, setError])

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const script = [
        'echo "===UFW==="',
        'sudo tail -n 40 /var/log/ufw.log 2>/dev/null || echo "(không có /var/log/ufw.log)"',
        'echo "===FIREWALLD==="',
        'sudo journalctl -u firewalld -n 30 --no-pager 2>/dev/null || echo "(không có log firewalld)"',
        'echo "===FAIL2BAN==="',
        'sudo tail -n 40 /var/log/fail2ban.log 2>/dev/null || echo "(không có /var/log/fail2ban.log)"'
      ].join('\n')
      const { stdout } = await exec(script)
      setLogs(stdout.trim() || 'Không đọc được nhật ký (cần quyền sudo).')
    } catch {
      setLogs('Lỗi đọc nhật ký tường lửa.')
    } finally {
      setLoadingLogs(false)
    }
  }, [exec])

  useEffect(() => {
    setLoading(true)
    fetchFirewall().finally(() => setLoading(false))
  }, [fetchFirewall, refreshKey, setLoading])

  useEffect(() => {
    if (subTab === 'logs' && !logs) fetchLogs()
  }, [subTab, logs, fetchLogs])

  const runAction = async (cmd: string, successMessage?: string, refresh = true) => {
    setBusy(true)
    try {
      const res = await exec(cmd)
      if (res.code !== 0) {
        alert('Lỗi: ' + (res.stderr || res.stdout || `mã ${res.code}`))
      } else if (successMessage) {
        alert(successMessage)
      }
      if (refresh) await fetchFirewall()
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleToggleFirewall = () => {
    if (engine === 'ufw') {
      if (active) {
        if (!confirm('Tắt tường lửa UFW? Máy chủ sẽ mở toàn bộ cổng đang bị chặn.')) return
        runAction('sudo ufw disable', 'Đã tắt UFW.')
      } else {
        runAction('echo "y" | sudo ufw enable', 'Đã bật UFW.')
      }
      return
    }

    if (engine === 'firewalld') {
      runAction(
        firewalld.running
          ? 'sudo systemctl stop firewalld'
          : 'sudo systemctl start firewalld && sudo systemctl enable firewalld',
        firewalld.running ? 'Đã dừng firewalld.' : 'Đã khởi động firewalld.'
      )
      return
    }

    alert(`Engine hiện tại (${engine}) không hỗ trợ bật/tắt từ đây. Dùng panel Services hoặc systemctl.`)
  }

  const handleInstallEngine = (target: 'ufw' | 'firewalld' | 'fail2ban') => {
    runAction(
      [
        'sudo apt-get update',
        `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${target}`,
        `sudo systemctl enable ${target} 2>/dev/null`,
        'true'
      ].join(' && '),
      `Đã cài đặt ${target}.`
    )
  }

  const handleAddRule = () => {
    const port = newPort.trim()
    const source = newSource.trim()
    if (!port) return alert('Vui lòng nhập cổng!')

    if (engine === 'ufw') {
      const base = newAction === 'allow' ? 'allow' : 'deny'
      const cmd = source
        ? `sudo ufw ${base} from ${source} to any port ${port} proto ${newProto}`
        : `sudo ufw ${base} ${port}/${newProto}`
      return runAction(cmd, `Đã thêm rule ${base} ${port}/${newProto}.`)
    }

    if (engine === 'firewalld') {
      const zoneArg = newZone ? ` --zone=${newZone}` : ''
      if (newAction === 'allow') {
        return runAction(
          `sudo firewall-cmd --permanent${zoneArg} --add-port=${port}/${newProto} && sudo firewall-cmd --reload`,
          `Đã mở ${port}/${newProto}.`
        )
      }
      const sourcePart = source ? ` source address="${source}"` : ''
      return runAction(
        `sudo firewall-cmd --permanent${zoneArg} --add-rich-rule='rule family="ipv4" port port="${port}" protocol="${newProto}"${sourcePart} drop' && sudo firewall-cmd --reload`,
        `Đã thêm rule chặn ${port}/${newProto}.`
      )
    }

    if (engine === 'iptables') {
      const target = newAction === 'allow' ? 'ACCEPT' : 'DROP'
      const src = source ? ` -s ${source}` : ''
      return runAction(
        `sudo iptables -I INPUT -p ${newProto} --dport ${port}${src} -j ${target}`,
        `Đã thêm rule ${target} cho ${port}/${newProto}.`
      )
    }

    if (engine === 'nftables') {
      const target = newAction === 'allow' ? 'accept' : 'drop'
      const src = source ? ` ip saddr ${source}` : ''
      return runAction(
        `sudo nft add rule inet filter input${src} ${newProto} dport ${port} ${target}`,
        `Đã thêm rule ${target} cho ${port}/${newProto}.`
      )
    }

    alert('Chưa có engine tường lửa để thêm rule.')
  }

  const handleDeleteUfwRule = (rule: UfwRule) => {
    if (!confirm(`Xóa rule #${rule.num} (${rule.to} → ${rule.from})?`)) return
    runAction(`sudo ufw --force delete ${rule.num}`, `Đã xóa rule #${rule.num}.`)
  }

  const handleDeleteIptablesRule = (rule: IptablesRule) => {
    if (!confirm(`Xóa rule iptables #${rule.num} (${rule.target} ${rule.prot} ${rule.extra})?`)) return
    runAction(`sudo iptables -D INPUT ${rule.num}`, `Đã xóa rule #${rule.num}.`)
  }

  const handleSaveIptables = () => {
    runAction(
      [
        'sudo netfilter-persistent save 2>/dev/null',
        '|| sudo service iptables save 2>/dev/null',
        '|| sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null',
        '|| echo "Không có công cụ lưu rules; hãy cài iptables-persistent"'
      ].join(' '),
      'Đã lưu cấu hình iptables (nếu hệ thống hỗ trợ).'
    )
  }

  const handleSetDefaultPolicy = (direction: 'INPUT' | 'OUTPUT', policy: string) => {
    runAction(
      `sudo ufw default ${policy.toLowerCase()} ${direction.toLowerCase()}`,
      `Đã đặt chính sách ${direction} = ${policy}.`
    )
  }

  const handleFirewalldService = (service: string, add: boolean) => {
    const zoneArg = newZone ? ` --zone=${newZone}` : ''
    runAction(
      `sudo firewall-cmd --permanent${zoneArg} --${add ? 'add' : 'remove'}-service=${service} && sudo firewall-cmd --reload`,
      `${add ? 'Đã mở' : 'Đã đóng'} service ${service}.`
    )
  }

  const handleFirewalldPort = (port: string, add: boolean) => {
    const zoneArg = newZone ? ` --zone=${newZone}` : ''
    runAction(
      `sudo firewall-cmd --permanent${zoneArg} --${add ? 'add' : 'remove'}-port=${port} && sudo firewall-cmd --reload`,
      `${add ? 'Đã mở' : 'Đã đóng'} cổng ${port}.`
    )
  }

  const handleSetDefaultZone = (zone: string) => {
    runAction(`sudo firewall-cmd --set-default-zone=${zone}`, `Đã đặt zone mặc định = ${zone}.`)
  }

  const handleUfwReset = () => {
    if (!confirm('Đặt lại UFW về mặc định? Toàn bộ rule sẽ bị xóa.')) return
    runAction('sudo ufw --force reset', 'Đã reset UFW.')
  }

  const handleFail2banRestart = () => runAction('sudo systemctl restart fail2ban', 'Đã khởi động lại fail2ban.')

  const handleFail2banUnban = (jail: string, ip: string) => {
    runAction(`sudo fail2ban-client set ${jail} unbanip ${ip}`, `Đã bỏ chặn ${ip} khỏi jail ${jail}.`)
  }

  const handleFail2banBan = () => {
    if (!banTarget || !banTarget.ip.trim()) return
    runAction(
      `sudo fail2ban-client set ${banTarget.jail} banip ${banTarget.ip.trim()}`,
      `Đã chặn ${banTarget.ip.trim()} trong jail ${banTarget.jail}.`
    )
    setBanTarget(null)
  }

  // Chưa có engine nào → màn hình cài đặt
  if (engine === 'none') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-lg mx-auto p-6 text-center space-y-4">
        <ShieldAlert size={48} className="text-[#f9e2af] opacity-70" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[#cdd6f4]">Chưa phát hiện tường lửa nào</h3>
          <p className="text-xs text-[#585b70]">
            Không tìm thấy ufw / firewalld / nftables / iptables. Cài một engine để quản lý tường lửa từ đây.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => handleInstallEngine('ufw')}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] disabled:opacity-40"
          >
            Cài UFW (Debian/Ubuntu)
          </button>
          <button
            onClick={() => handleInstallEngine('firewalld')}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-white/5 text-[#cdd6f4] text-xs font-bold hover:bg-white/10 disabled:opacity-40"
          >
            Cài firewalld (RHEL/Alma)
          </button>
        </div>
        {busy && <span className="text-[10px] text-[#89b4fa] animate-pulse">Đang cài đặt, vui lòng đợi...</span>}
      </div>
    )
  }

  const engineLabel: Record<FirewallEngine, string> = {
    ufw: 'UFW (Uncomplicated Firewall)',
    firewalld: 'firewalld (zones)',
    nftables: 'nftables',
    iptables: 'iptables (legacy)',
    none: 'Không có'
  }

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {/* Header trạng thái */}
      <div className="flex flex-wrap items-center gap-3 bg-[#181825] border border-white/[0.04] p-3 rounded-xl shrink-0 mb-3">
        <div className={`p-2 rounded-lg ${active ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'}`}>
          {active ? <Shield size={18} /> : <ShieldOff size={18} />}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#cdd6f4]">
            {engineLabel[engine]} · {active ? 'Đang hoạt động' : 'Đang tắt'}
          </div>
          <div className="text-[10px] text-[#585b70] font-mono truncate">
            Engine khả dụng: {availableEngines.length ? availableEngines.join(', ') : 'không có'}
            {firewalld.defaultZone ? ` · zone mặc định: ${firewalld.defaultZone}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] flex items-center gap-1.5"
          >
            <Plus size={12} /> Thêm rule
          </button>
          <button
            onClick={handleToggleFirewall}
            disabled={busy}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 ${
              active
                ? 'bg-[#f38ba8]/15 text-[#f38ba8] hover:bg-[#f38ba8]/25'
                : 'bg-[#a6e3a1]/15 text-[#a6e3a1] hover:bg-[#a6e3a1]/25'
            }`}
          >
            <Power size={11} /> {active ? 'Tắt tường lửa' : 'Bật tường lửa'}
          </button>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 mb-3 shrink-0 flex-wrap">
        {(
          [
            ['overview', 'Tổng quan', Activity],
            ['rules', `Quy tắc (${engine === 'ufw' ? ufwRules.length : engine === 'iptables' ? iptablesRules.length : engine === 'firewalld' ? firewalld.ports.length + firewalld.services.length : 0})`, Shield],
            ['fail2ban', 'fail2ban', Ban],
            ['logs', 'Nhật ký', Terminal]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === id
                ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold'
                : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
            }`}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
          {engine === 'ufw' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                  Chính sách mặc định (default policy)
                </span>
                {(['INPUT', 'OUTPUT'] as const).map((direction) => {
                  const current = direction === 'INPUT' ? defaultIncoming : defaultOutgoing
                  return (
                    <div key={direction} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[#cdd6f4] font-mono">{direction}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            current === 'ACCEPT' ? 'bg-[#f9e2af]/15 text-[#f9e2af]' : 'bg-[#a6e3a1]/15 text-[#a6e3a1]'
                          }`}
                        >
                          {current || '—'}
                        </span>
                        {['DENY', 'ALLOW', 'REJECT'].map((policy) => (
                          <button
                            key={policy}
                            onClick={() => handleSetDefaultPolicy(direction, policy)}
                            disabled={busy || current === policy}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-30 font-mono"
                          >
                            {policy}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <p className="text-[10px] text-[#45475a]">
                  Nên đặt INPUT = DENY và chỉ mở các cổng cần thiết (22, 80, 443...).
                </p>
              </div>

              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">Hành động</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runAction('sudo ufw reload', 'Đã nạp lại cấu hình UFW.')}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <RefreshCw size={11} /> Reload
                  </button>
                  <button
                    onClick={() => runAction('sudo ufw logging on', 'Đã bật ghi nhật ký UFW.')}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40"
                  >
                    Bật logging
                  </button>
                  <button
                    onClick={handleUfwReset}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f38ba8]/15 hover:bg-[#f38ba8]/25 text-[#f38ba8] disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <AlertTriangle size={11} /> Reset UFW
                  </button>
                </div>
                <p className="text-[10px] text-[#45475a]">
                  Tổng số rule đang áp dụng: <span className="text-[#cdd6f4] font-bold">{ufwRules.length}</span>
                </p>
              </div>
            </div>
          )}

          {engine === 'firewalld' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                  Zone mặc định & zone đang hoạt động
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[#cdd6f4] font-mono">default: {firewalld.defaultZone || '—'}</span>
                  {['public', 'internal', 'external', 'dmz', 'trusted', 'drop'].map((zone) => (
                    <button
                      key={zone}
                      onClick={() => handleSetDefaultZone(zone)}
                      disabled={busy || firewalld.defaultZone === zone}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-30 font-mono"
                    >
                      {zone}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  {firewalld.activeZones.length === 0 && (
                    <span className="text-[10px] text-[#45475a]">Không có zone nào đang hoạt động.</span>
                  )}
                  {firewalld.activeZones.map((zone) => (
                    <div key={zone.name} className="text-[10px] text-[#585b70] font-mono">
                      {zone.name} ← {zone.interfaces || '(không có interface)'}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => runAction('sudo firewall-cmd --reload', 'Đã nạp lại firewalld.')}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 flex items-center gap-1.5"
                >
                  <RefreshCw size={11} /> Reload
                </button>
              </div>

              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">Zone đang thao tác</span>
                <input
                  type="text"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  placeholder={`để trống = zone mặc định (${firewalld.defaultZone || 'public'})`}
                  className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono"
                />
                <div className="text-[10px] text-[#585b70]">
                  Services: <span className="text-[#cdd6f4]">{firewalld.services.join(', ') || '—'}</span>
                </div>
                <div className="text-[10px] text-[#585b70]">
                  Ports: <span className="text-[#cdd6f4]">{firewalld.ports.join(', ') || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {(engine === 'iptables' || engine === 'nftables') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                  {engine === 'nftables' ? 'nftables' : 'iptables'} (kernel netfilter)
                </span>
                <p className="text-[10px] text-[#585b70] leading-relaxed">
                  Đang dùng {engine} trực tiếp. Rule thêm từ panel này có hiệu lực ngay nhưng cần lưu lại để giữ sau khi
                  khởi động lại máy chủ.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveIptables}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Save size={11} /> Lưu rule
                  </button>
                  <button
                    onClick={() =>
                      runAction(
                        'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ufw',
                        'Đã cài UFW — dùng UFW sẽ dễ quản lý hơn.'
                      )
                    }
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40"
                  >
                    Cài UFW cho dễ quản lý
                  </button>
                </div>
              </div>
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">Quy tắc INPUT</span>
                <div className="text-[10px] text-[#585b70]">
                  Số rule: <span className="text-[#cdd6f4] font-bold">{iptablesRules.length}</span>
                </div>
                <div className="text-[10px] text-[#585b70]">
                  ACCEPT: <span className="text-[#a6e3a1]">{iptablesRules.filter((r) => r.target === 'ACCEPT').length}</span>
                  {' · '}DROP/REJECT:{' '}
                  <span className="text-[#f38ba8]">
                    {iptablesRules.filter((r) => r.target === 'DROP' || r.target === 'REJECT').length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'rules' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {engine === 'ufw' && (
            <div className="bg-[#181825] border border-white/[0.04] rounded-xl overflow-hidden">
              <div className="grid grid-cols-[50px_1fr_120px_1fr_50px] gap-2 px-3 py-2 bg-[#11111b] text-[10px] font-bold uppercase tracking-wider text-[#585b70]">
                <span>#</span>
                <span>Đích (To)</span>
                <span>Hành động</span>
                <span>Nguồn (From)</span>
                <span />
              </div>
              {ufwRules.length === 0 && (
                <div className="text-center text-xs text-[#45475a] py-10">
                  Chưa có rule nào. Bấm "Thêm rule" để mở cổng.
                </div>
              )}
              {ufwRules.map((rule) => (
                <div
                  key={rule.num}
                  className="grid grid-cols-[50px_1fr_120px_1fr_50px] gap-2 px-3 py-2 text-xs items-center border-t border-white/[0.03] hover:bg-white/[0.02]"
                >
                  <span className="text-[#585b70] font-mono">{rule.num}</span>
                  <span className="text-[#cdd6f4] font-mono truncate">{rule.to}</span>
                  <span
                    className={`text-[10px] font-bold ${
                      rule.action.includes('ALLOW') || rule.action.includes('LIMIT')
                        ? 'text-[#a6e3a1]'
                        : 'text-[#f38ba8]'
                    }`}
                  >
                    {rule.action}
                  </span>
                  <span className="text-[#a6adc8] font-mono truncate">{rule.from}</span>
                  <button
                    onClick={() => handleDeleteUfwRule(rule)}
                    disabled={busy}
                    className="p-1 rounded hover:bg-[#f38ba8]/15 text-[#f38ba8] disabled:opacity-40 justify-self-end"
                    title="Xóa rule"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {engine === 'firewalld' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                  Services đang mở {newZone ? `(zone ${newZone})` : ''}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {firewalld.services.length === 0 && (
                    <span className="text-[10px] text-[#45475a]">Chưa mở service nào.</span>
                  )}
                  {firewalld.services.map((service) => (
                    <button
                      key={service}
                      onClick={() => handleFirewalldService(service, false)}
                      disabled={busy}
                      className="text-[10px] px-2 py-1 rounded-lg bg-[#a6e3a1]/15 text-[#a6e3a1] hover:bg-[#f38ba8]/20 hover:text-[#f38ba8] disabled:opacity-40 font-mono"
                      title="Bấm để đóng service này"
                    >
                      {service} ✕
                    </button>
                  ))}
                </div>
                <div className="pt-2 border-t border-white/[0.04]">
                  <div className="text-[10px] text-[#585b70] mb-1.5">Mở nhanh service phổ biến</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_SERVICES.filter((s) => !firewalld.services.includes(s)).map((service) => (
                      <button
                        key={service}
                        onClick={() => handleFirewalldService(service, true)}
                        disabled={busy}
                        className="text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 font-mono"
                      >
                        + {service}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                  Ports đang mở {newZone ? `(zone ${newZone})` : ''}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {firewalld.ports.length === 0 && <span className="text-[10px] text-[#45475a]">Chưa mở port nào.</span>}
                  {firewalld.ports.map((port) => (
                    <button
                      key={port}
                      onClick={() => handleFirewalldPort(port, false)}
                      disabled={busy}
                      className="text-[10px] px-2 py-1 rounded-lg bg-[#89b4fa]/15 text-[#89b4fa] hover:bg-[#f38ba8]/20 hover:text-[#f38ba8] disabled:opacity-40 font-mono"
                      title="Bấm để đóng port này"
                    >
                      {port} ✕
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-white/[0.04]">
                  <input
                    type="text"
                    value={newPort}
                    onChange={(e) => setNewPort(e.target.value)}
                    placeholder="8080 hoặc 8080/tcp"
                    className="flex-1 min-w-0 bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] font-mono outline-none"
                  />
                  <button
                    onClick={() => {
                      if (!newPort.trim()) return alert('Nhập cổng trước!')
                      const value = newPort.includes('/') ? newPort.trim() : `${newPort.trim()}/${newProto}`
                      handleFirewalldPort(value, true)
                    }}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] disabled:opacity-40 shrink-0"
                  >
                    Mở port
                  </button>
                </div>
              </div>
            </div>
          )}

          {engine === 'iptables' && (
            <div className="bg-[#181825] border border-white/[0.04] rounded-xl overflow-hidden">
              <div className="grid grid-cols-[45px_70px_80px_60px_1fr_1fr_1fr_45px] gap-2 px-3 py-2 bg-[#11111b] text-[10px] font-bold uppercase tracking-wider text-[#585b70]">
                <span>#</span>
                <span>Chain</span>
                <span>Target</span>
                <span>Proto</span>
                <span>Nguồn</span>
                <span>Đích</span>
                <span>Tuỳ chọn</span>
                <span />
              </div>
              {iptablesRules.length === 0 && (
                <div className="text-center text-xs text-[#45475a] py-10">Không đọc được rule iptables (cần quyền sudo).</div>
              )}
              {iptablesRules.map((rule) => (
                <div
                  key={rule.num}
                  className="grid grid-cols-[45px_70px_80px_60px_1fr_1fr_1fr_45px] gap-2 px-3 py-2 text-[10px] items-center border-t border-white/[0.03] hover:bg-white/[0.02] font-mono"
                >
                  <span className="text-[#585b70]">{rule.num}</span>
                  <span className="text-[#a6adc8]">{rule.chain}</span>
                  <span className={rule.target === 'ACCEPT' ? 'text-[#a6e3a1]' : 'text-[#f38ba8]'}>{rule.target}</span>
                  <span className="text-[#a6adc8]">{rule.prot}</span>
                  <span className="text-[#cdd6f4] truncate">{rule.source}</span>
                  <span className="text-[#cdd6f4] truncate">{rule.destination}</span>
                  <span className="text-[#585b70] truncate">{rule.extra}</span>
                  <button
                    onClick={() => handleDeleteIptablesRule(rule)}
                    disabled={busy}
                    className="p-1 rounded hover:bg-[#f38ba8]/15 text-[#f38ba8] disabled:opacity-40 justify-self-end"
                    title="Xóa rule"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {engine === 'nftables' && (
            <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                nftables ruleset (chỉ đọc)
              </span>
              <pre className="max-h-[420px] overflow-auto scrollbar-thin bg-[#11111b] p-3 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap select-text">
                {nftRuleset || 'Không đọc được ruleset (cần quyền sudo).'}
              </pre>
              <p className="text-[10px] text-[#45475a]">
                Dùng nút "Thêm rule" để chèn rule vào chain <code className="text-[#89b4fa]">inet filter input</code>. Xóa rule cần
                handle — hãy dùng dòng lệnh nft nếu cần xóa chính xác.
              </p>
            </div>
          )}
        </div>
      )}

      {subTab === 'fail2ban' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
          {!fail2banInstalled ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#585b70] gap-3">
              <Ban size={40} className="opacity-50" />
              <h3 className="text-sm font-bold text-[#cdd6f4]">fail2ban chưa được cài đặt</h3>
              <p className="text-xs max-w-md text-center">
                fail2ban tự động chặn IP brute-force SSH/FTP/web dựa trên log. Rất nên bật cho máy chủ có cổng 22 mở.
              </p>
              <button
                onClick={() => handleInstallEngine('fail2ban')}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] disabled:opacity-40"
              >
                Cài đặt fail2ban
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 bg-[#181825] border border-white/[0.04] rounded-xl p-3">
                <Ban size={16} className="text-[#f9e2af]" />
                <div className="text-xs text-[#cdd6f4] font-bold">
                  {jails.length} jail đang hoạt động ·{' '}
                  <span className="text-[#f38ba8]">
                    {jails.reduce((sum, jail) => sum + Number(jail.currentlyBanned || 0), 0)} IP đang bị chặn
                  </span>
                </div>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={handleFail2banRestart}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <RefreshCw size={11} /> Khởi động lại
                  </button>
                  <button
                    onClick={() => runAction('sudo fail2ban-client reload', 'Đã nạp lại cấu hình fail2ban.')}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40"
                  >
                    Reload
                  </button>
                </div>
              </div>

              {jails.length === 0 && (
                <div className="text-center text-xs text-[#45475a] py-8">
                  Không đọc được jail nào. Kiểm tra quyền sudo hoặc dịch vụ fail2ban đang chạy.
                </div>
              )}

              {jails.map((jail) => (
                <div key={jail.name} className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#cdd6f4] font-mono">{jail.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#f38ba8]/15 text-[#f38ba8]">
                      đang chặn: {jail.currentlyBanned}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#a6adc8]">
                      tổng đã chặn: {jail.totalBanned}
                    </span>
                    <button
                      onClick={() => setBanTarget({ jail: jail.name, ip: '' })}
                      className="ml-auto text-[10px] px-2 py-1 rounded-lg bg-[#f9e2af]/15 text-[#f9e2af] hover:bg-[#f9e2af]/25 font-semibold"
                    >
                      + Chặn IP
                    </button>
                  </div>

                  {jail.bannedIps.length === 0 ? (
                    <div className="text-[10px] text-[#45475a]">Không có IP nào đang bị chặn trong jail này.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {jail.bannedIps.map((ip) => (
                        <button
                          key={ip}
                          onClick={() => handleFail2banUnban(jail.name, ip)}
                          disabled={busy}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[#f38ba8]/15 text-[#f38ba8] hover:bg-[#a6e3a1]/20 hover:text-[#a6e3a1] disabled:opacity-40 font-mono flex items-center gap-1"
                          title="Bấm để bỏ chặn"
                        >
                          {ip} <Unlock size={9} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'logs' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#181825] border border-white/[0.04] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
              Nhật ký UFW / firewalld / fail2ban
            </span>
            <button
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 flex items-center gap-1.5"
            >
              <RefreshCw size={11} className={loadingLogs ? 'animate-spin' : ''} /> Tải lại
            </button>
          </div>
          <pre className="flex-1 overflow-auto scrollbar-thin bg-[#11111b] p-3 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap select-text">
            {logs || 'Đang tải nhật ký...'}
          </pre>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                Thêm rule · {engineLabel[engine]}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70]">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Cổng (Port) *</label>
                <input
                  type="text"
                  autoFocus
                  value={newPort}
                  onChange={(e) => setNewPort(e.target.value)}
                  placeholder="ví dụ: 8080 hoặc 3000:3010"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Giao thức</label>
                <select
                  value={newProto}
                  onChange={(e) => setNewProto(e.target.value as 'tcp' | 'udp')}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Hành động</label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as 'allow' | 'deny')}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                >
                  <option value="allow">Cho phép (ALLOW)</option>
                  <option value="deny">Chặn (DENY)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">IP nguồn (tuỳ chọn)</label>
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="để trống = mọi IP"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                />
              </div>

              {engine === 'firewalld' && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Zone (tuỳ chọn)</label>
                  <input
                    type="text"
                    value={newZone}
                    onChange={(e) => setNewZone(e.target.value)}
                    placeholder={firewalld.defaultZone || 'public'}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddRule}
                  disabled={busy}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] disabled:opacity-40"
                >
                  Thêm rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {banTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setBanTarget(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[360px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                Chặn IP trong jail {banTarget.jail}
              </h3>
              <button onClick={() => setBanTarget(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <input
                type="text"
                autoFocus
                value={banTarget.ip}
                onChange={(e) => setBanTarget({ ...banTarget, ip: e.target.value })}
                placeholder="1.2.3.4"
                className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setBanTarget(null)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  onClick={handleFail2banBan}
                  disabled={busy}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#f38ba8] text-[#1e1e2e] hover:bg-[#f38ba8]/80 disabled:opacity-40"
                >
                  Chặn IP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
