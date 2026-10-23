import { useState, useEffect, useCallback } from 'react'
import {
  Database,
  Square,
  ArrowRight,
  X,
  Terminal,
  List,
  Plus,
  RefreshCw,
  Trash2,
  DownloadCloud,
  Search,
  CheckCircle,
  Key,
  Shield,
  Activity
} from 'lucide-react'

interface DbInstance {
  type: 'mysql' | 'postgres' | 'redis' | 'mongodb' | 'unknown'
  port: string
  address: string
  processName: string
  pid: string
}

interface ActiveTunnel {
  id: string
  listenPort: number
  targetPort: number
  active: boolean
}

interface DbUser {
  name: string
  host: string
  superuser: boolean
  canLogin: boolean
}

interface DatabasePanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function DatabasePanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: DatabasePanelProps) {
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([])
  const [activeTunnels, setActiveTunnels] = useState<ActiveTunnel[]>([])
  const [showCreateTunnelModal, setShowCreateTunnelModal] = useState<{ dbPort: string; dbType: string } | null>(null)
  const [tunnelLocalPortInput, setTunnelLocalPortInput] = useState<string>('')
  const [tunnelNameInput, setTunnelNameInput] = useState<string>('')
  const [dbStats, setDbStats] = useState<Record<string, { version: string; connections: string }>>({})
  const [dbListModal, setDbListModal] = useState<{ type: string; databases: string[] } | null>(null)
  const [quickQueryModal, setQuickQueryModal] = useState<{ type: string; port: string } | null>(null)
  const [queryInput, setQueryInput] = useState('')
  const [queryResult, setQueryResult] = useState('')

  // Redis Explorer states
  const [showRedisExplorer, setShowRedisExplorer] = useState<{ port: string } | null>(null)
  const [redisKeys, setRedisKeys] = useState<string[]>([])
  const [redisSearchPattern, setRedisSearchPattern] = useState('*')
  const [selectedRedisKey, setSelectedRedisKey] = useState<string | null>(null)
  const [selectedRedisType, setSelectedRedisType] = useState('')
  const [selectedRedisValue, setSelectedRedisValue] = useState('')
  const [loadingRedis, setLoadingRedis] = useState(false)

  // DB Backup/Restore Modal states
  const [quickBackupModal, setQuickBackupModal] = useState<{ type: string; port: string } | null>(null)
  const [backupActionType, setBackupActionType] = useState<'export' | 'import'>('export')
  const [backupDbName, setBackupDbName] = useState('')
  const [backupSqlPath, setBackupSqlPath] = useState('')
  const [backupStatusMsg, setBackupStatusMsg] = useState('')
  const [runningDbBackup, setRunningDbBackup] = useState(false)

  // Người dùng database
  const [userModal, setUserModal] = useState<{ type: 'mysql' | 'postgres'; port: string } | null>(null)
  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserHost, setNewUserHost] = useState('%')
  const [newUserGrants, setNewUserGrants] = useState('ALL PRIVILEGES')
  const [newUserDb, setNewUserDb] = useState('*')
  const [creatingUser, setCreatingUser] = useState(false)
  const [grantsModal, setGrantsModal] = useState<{ title: string; content: string } | null>(null)

  // Cài đặt engine
  const [installingEngine, setInstallingEngine] = useState<string | null>(null)
  const [installLog, setInstallLog] = useState('')

  /** Mã hoá base64 để tránh lỗi quoting khi truyền mật khẩu qua shell. */
  const toBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }

  const fetchDbUsers = useCallback(
    async (type: 'mysql' | 'postgres') => {
      setLoadingUsers(true)
      try {
        if (type === 'mysql') {
          const { stdout } = await exec(
            "sudo mysql -N -B -e \"SELECT User, Host FROM mysql.user WHERE User NOT LIKE 'mysql.%' ORDER BY User\" 2>/dev/null || mysql -N -B -e \"SELECT User, Host FROM mysql.user WHERE User NOT LIKE 'mysql.%' ORDER BY User\" 2>/dev/null || echo ''"
          )
          const users: DbUser[] = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [name, host] = line.split('\t')
              return { name: name || line, host: host || '%', superuser: name === 'root', canLogin: true }
            })
          setDbUsers(users)
        } else {
          const { stdout } = await exec(
            "sudo -u postgres psql -t -A -F'|' -c \"SELECT rolname, rolsuper, rolcanlogin FROM pg_roles ORDER BY rolname\" 2>/dev/null || echo ''"
          )
          const users: DbUser[] = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [name, isSuper, canLogin] = line.split('|')
              return { name: name || line, host: '-', superuser: isSuper === 't', canLogin: canLogin === 't' }
            })
          setDbUsers(users)
        }
      } catch (e: any) {
        setError(e.message || 'Lỗi tải danh sách user database')
      } finally {
        setLoadingUsers(false)
      }
    },
    [exec, setError]
  )

  /** Đưa câu lệnh SQL qua base64 để mật khẩu không bị shell diễn giải. */
  const runSql = async (type: 'mysql' | 'postgres', sql: string, database?: string) => {
    const payload = `echo '${toBase64(sql)}' | base64 -d | `
    if (type === 'postgres') {
      const dbArg = database ? `-d "${database}" ` : ''
      return exec(`${payload}sudo -u postgres psql ${dbArg}-v ON_ERROR_STOP=1 2>&1`)
    }
    // MySQL/MariaDB: chọn client nào chạy được (có thể cần sudo)
    const probe = await exec('(sudo mysql -e "SELECT 1" >/dev/null 2>&1 && echo sudo) || (mysql -e "SELECT 1" >/dev/null 2>&1 && echo plain) || echo none')
    const mode = probe.stdout.trim()
    if (mode === 'sudo') return exec(`${payload}sudo mysql 2>&1`)
    if (mode === 'plain') return exec(`${payload}mysql 2>&1`)
    return { stdout: '', stderr: 'Không đăng nhập được MySQL (thiếu quyền hoặc sai mật khẩu root).', code: 1 }
  }

  const handleCreateDbUser = async () => {
    if (!userModal) return
    const name = newUserName.trim()
    if (!name) return alert('Vui lòng nhập tên user!')
    if (!/^[A-Za-z_][A-Za-z0-9_$-]{0,31}$/.test(name)) {
      return alert('Tên user chỉ gồm chữ, số, gạch dưới/gạch ngang (tối đa 32 ký tự).')
    }
    if (newUserPassword.length < 6) return alert('Mật khẩu cần tối thiểu 6 ký tự!')
    if (newUserPassword.includes('\n')) return alert('Mật khẩu không được chứa ký tự xuống dòng.')

    setCreatingUser(true)
    try {
      const sqlPassword = newUserPassword.replace(/'/g, "''")
      const dbName = newUserDb.trim()

      if (userModal.type === 'mysql') {
        const target = dbName ? `${dbName}.*` : '*.*'
        const sql = [
          `CREATE USER IF NOT EXISTS '${name}'@'${newUserHost}' IDENTIFIED BY '${sqlPassword}';`,
          `ALTER USER '${name}'@'${newUserHost}' IDENTIFIED BY '${sqlPassword}';`,
          `GRANT ${newUserGrants} ON ${target} TO '${name}'@'${newUserHost}';`,
          'FLUSH PRIVILEGES;'
        ].join('\n')
        const res = await runSql('mysql', sql)
        if (res.code !== 0 || /ERROR/i.test(res.stdout + res.stderr)) {
          throw new Error((res.stderr || res.stdout).trim() || 'Không tạo được user MySQL')
        }
      } else {
        const database = dbName || 'postgres'
        const sql = [
          `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${name}') THEN CREATE ROLE "${name}" LOGIN; END IF; END $$;`,
          `ALTER ROLE "${name}" WITH LOGIN PASSWORD '${sqlPassword}';`,
          `GRANT ${newUserGrants} ON DATABASE "${database}" TO "${name}";`
        ].join('\n')
        const res = await runSql('postgres', sql)
        if (res.code !== 0 || /ERROR/i.test(res.stdout + res.stderr)) {
          throw new Error((res.stderr || res.stdout).trim() || 'Không tạo được role PostgreSQL')
        }
        // Cấp quyền trên schema public của database đích
        await runSql(
          'postgres',
          `GRANT ALL ON SCHEMA public TO "${name}"; GRANT ALL ON ALL TABLES IN SCHEMA public TO "${name}"; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${name}";`,
          database
        )
      }

      setNewUserName('')
      setNewUserPassword('')
      setNewUserDb('')
      await fetchDbUsers(userModal.type)
      alert(`Đã tạo user ${name}.`)
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setCreatingUser(false)
    }
  }

  const handleDropDbUser = async (user: DbUser) => {
    if (!userModal) return
    if (!confirm(`Xóa user "${user.name}"? Hành động này không thể hoàn tác.`)) return
    try {
      const sql =
        userModal.type === 'mysql'
          ? `DROP USER '${user.name}'@'${user.host}'; FLUSH PRIVILEGES;`
          : `DROP ROLE "${user.name}";`
      const res = await runSql(userModal.type, sql)
      if (res.code !== 0 || /ERROR/i.test(res.stdout + res.stderr)) {
        throw new Error((res.stderr || res.stdout).trim() || 'Không xóa được user')
      }
      await fetchDbUsers(userModal.type)
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleChangeDbUserPassword = async (user: DbUser) => {
    if (!userModal) return
    const password = prompt(`Mật khẩu mới cho "${user.name}":`)
    if (!password) return
    if (password.includes('\n')) return alert('Mật khẩu không được chứa ký tự xuống dòng.')
    try {
      const sqlPassword = password.replace(/'/g, "''")
      const sql =
        userModal.type === 'mysql'
          ? `ALTER USER '${user.name}'@'${user.host}' IDENTIFIED BY '${sqlPassword}'; FLUSH PRIVILEGES;`
          : `ALTER ROLE "${user.name}" WITH LOGIN PASSWORD '${sqlPassword}';`
      const res = await runSql(userModal.type, sql)
      if (res.code !== 0 || /ERROR/i.test(res.stdout + res.stderr)) {
        throw new Error((res.stderr || res.stdout).trim() || 'Không đổi được mật khẩu')
      }
      alert(`Đã đổi mật khẩu cho ${user.name}.`)
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleShowGrants = async (user: DbUser) => {
    if (!userModal) return
    const cmd =
      userModal.type === 'mysql'
        ? `sudo mysql -e "SHOW GRANTS FOR '${user.name}'@'${user.host}'" 2>&1 || mysql -e "SHOW GRANTS FOR '${user.name}'@'${user.host}'" 2>&1`
        : `sudo -u postgres psql -c "\\du+ ${user.name}" 2>&1`
    const { stdout, stderr } = await exec(cmd)
    setGrantsModal({
      title: `Quyền của ${user.name}`,
      content: (stdout || stderr || 'Không đọc được quyền.').trim()
    })
  }

  const handleInstallEngine = async (engine: 'mariadb' | 'postgresql' | 'redis') => {
    setInstallingEngine(engine)
    setInstallLog(`Bắt đầu cài đặt ${engine}...\n`)
    try {
      const packages =
        engine === 'mariadb'
          ? 'mariadb-server mariadb-client'
          : engine === 'postgresql'
            ? 'postgresql postgresql-contrib'
            : 'redis-server'
      const service = engine === 'mariadb' ? 'mariadb' : engine

      setInstallLog((prev) => prev + 'Cập nhật danh sách gói...\n')
      await exec('sudo apt-get update')

      setInstallLog((prev) => prev + `Cài đặt: ${packages}\n`)
      const res = await exec(`sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages}`)
      if (res.code !== 0) throw new Error(res.stderr || 'apt-get install thất bại')

      setInstallLog((prev) => prev + `Khởi động dịch vụ ${service}...\n`)
      await exec(`sudo systemctl start ${service} 2>/dev/null || sudo systemctl start ${engine} 2>/dev/null`)
      await exec(`sudo systemctl enable ${service} 2>/dev/null || sudo systemctl enable ${engine} 2>/dev/null`)

      setInstallLog((prev) => prev + 'Hoàn tất! Đang làm mới danh sách...\n')
      await fetchDatabaseInstances()
    } catch (e: any) {
      setInstallLog((prev) => prev + `Lỗi: ${e.message}\n`)
      setError('Cài đặt thất bại: ' + e.message)
    } finally {
      setInstallingEngine(null)
    }
  }


  const fetchTunnels = useCallback(async () => {
    try {
      const list = await window.api.tunnel.list()
      const filtered = list.map((t: any) => ({
        id: t.id,
        listenPort: t.listenPort,
        targetPort: t.targetPort,
        active: t.active
      }))
      setActiveTunnels(filtered)
    } catch {}
  }, [])

  const fetchDatabaseInstances = useCallback(async () => {
    try {
      const script = `sudo ss -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true`
      const { stdout } = await exec(script)
      const lines = stdout.split('\n')
      const instances: DbInstance[] = []
      lines.forEach((l) => {
        const line = l.replace(/\s+/g, ' ').trim()
        if (!line || line.startsWith('Netid') || line.startsWith('Active') || line.startsWith('Proto')) return

        const tokens = line.split(' ')
        if (tokens.length < 4) return

        let localAddressPort = ''
        let processInfo = ''

        if (line.includes('LISTEN') || tokens.includes('LISTEN') || tokens[1] === 'LISTEN') {
          if (line.includes('users:')) {
            localAddressPort = tokens[4]
            processInfo = tokens.slice(6).join(' ')
          } else {
            localAddressPort = tokens[3]
            processInfo = tokens[tokens.length - 1]
          }

          if (localAddressPort) {
            const lastColonIdx = localAddressPort.lastIndexOf(':')
            if (lastColonIdx !== -1) {
              const address = localAddressPort.substring(0, lastColonIdx)
              const port = localAddressPort.substring(lastColonIdx + 1)

              let processName = '-'
              let pid = '-'
              if (processInfo.includes('users:')) {
                const match = processInfo.match(/users:\(\("([^"]+)",(?:pid|pgid)=(\d+)/)
                if (match) {
                  processName = match[1]
                  pid = match[2]
                }
              } else if (processInfo.includes('/')) {
                const match = processInfo.match(/(\d+)\/(.+)/)
                if (match) {
                  pid = match[1]
                  processName = match[2]
                }
              } else {
                processName = processInfo
              }

              let type: DbInstance['type'] = 'unknown'
              const portNum = parseInt(port)
              const lowerProc = processName.toLowerCase()

              if (portNum === 3306 || lowerProc.includes('mysql') || lowerProc.includes('mariadb')) type = 'mysql'
              else if (portNum === 5432 || lowerProc.includes('postgres')) type = 'postgres'
              else if (portNum === 6379 || lowerProc.includes('redis')) type = 'redis'
              else if (portNum === 27017 || lowerProc.includes('mongod')) type = 'mongodb'

              if (type !== 'unknown') {
                if (!instances.some((i) => i.port === port && i.type === type)) {
                  instances.push({ type, port, address, processName, pid })
                }
              }
            }
          }
        }
      })
      setDbInstances(instances)
      await fetchTunnels()

      // Fetch stats
      const statsMap: Record<string, { version: string; connections: string }> = {}
      for (const inst of instances) {
        try {
          if (inst.type === 'mysql') {
            const ver = await exec('mysql -V 2>/dev/null || echo "unknown"')
            const conns = await exec('mysqladmin status 2>/dev/null || echo ""')
            const connMatch = (conns.stdout || '').match(/Threads:\s+(\d+)/)
            statsMap[`${inst.type}-${inst.port}`] = {
              version: (ver.stdout || '').split('\n')[0].trim(),
              connections: connMatch ? connMatch[1] : '-'
            }
          } else if (inst.type === 'postgres') {
            const ver = await exec('psql --version 2>/dev/null || echo "unknown"')
            const conns = await exec("sudo -u postgres psql -t -c 'SELECT count(*) FROM pg_stat_activity' 2>/dev/null || echo '-'")
            statsMap[`${inst.type}-${inst.port}`] = {
              version: (ver.stdout || '').split('\n')[0].trim(),
              connections: (conns.stdout || '-').trim()
            }
          } else if (inst.type === 'redis') {
            const info = await exec('redis-cli info server 2>/dev/null | head -5 || echo "unknown"')
            const verMatch = (info.stdout || '').match(/redis_version:(.+)/)
            const clients = await exec('redis-cli info clients 2>/dev/null | grep connected_clients || echo ""')
            const clientMatch = (clients.stdout || '').match(/connected_clients:(\d+)/)
            statsMap[`${inst.type}-${inst.port}`] = {
              version: verMatch ? `Redis ${verMatch[1].trim()}` : 'Redis',
              connections: clientMatch ? clientMatch[1] : '-'
            }
          } else if (inst.type === 'mongodb') {
            const ver = await exec('mongod --version 2>/dev/null | head -1 || echo "unknown"')
            statsMap[`${inst.type}-${inst.port}`] = {
              version: (ver.stdout || '').split('\n')[0].trim(),
              connections: '-'
            }
          }
        } catch {}
      }
      setDbStats(statsMap)
    } catch (e: any) {
      setError(e.message || 'Lỗi tải cơ sở dữ liệu')
    }
  }, [exec, fetchTunnels, setError])

  const handleOpenTunnelModal = (port: string, type: string) => {
    setTunnelLocalPortInput(port)
    setTunnelNameInput(`${type.toUpperCase()} Tunnel`)
    setShowCreateTunnelModal({ dbPort: port, dbType: type })
  }

  const handleCreateTunnel = async () => {
    if (!showCreateTunnelModal || !tunnelLocalPortInput || !tunnelNameInput) return
    setLoading(true)
    const result = await window.api.tunnel.startLocal(
      sessionId,
      tunnelNameInput,
      parseInt(tunnelLocalPortInput),
      'localhost',
      parseInt(showCreateTunnelModal.dbPort)
    )
    if (result.error) {
      alert('Lỗi tạo tunnel: ' + result.error)
    } else {
      setShowCreateTunnelModal(null)
      await fetchDatabaseInstances()
    }
    setLoading(false)
  }

  const handleStopTunnel = async (tunnelId: string) => {
    setLoading(true)
    await window.api.tunnel.stop(tunnelId)
    await fetchDatabaseInstances()
    setLoading(false)
  }

  const handleFetchRedisKeys = async (port: string, pattern: string) => {
    setLoadingRedis(true)
    try {
      const cmd = `redis-cli -p ${port} --scan --pattern "${pattern || '*'}" LIMIT 100 2>/dev/null || redis-cli -p ${port} KEYS "${pattern || '*'}" 2>/dev/null | head -n 100 || echo ""`
      const { stdout } = await exec(cmd)
      const keys = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      setRedisKeys(keys)
      setSelectedRedisKey(null)
      setSelectedRedisValue('')
      setSelectedRedisType('')
    } catch {}
    setLoadingRedis(false)
  }

  const handleReadRedisKey = async (port: string, key: string) => {
    setLoadingRedis(true)
    try {
      const typeRes = await exec(`redis-cli -p ${port} TYPE "${key}"`)
      const type = typeRes.stdout.trim()
      setSelectedRedisType(type)

      let valCmd = ''
      if (type === 'string') {
        valCmd = `redis-cli -p ${port} GET "${key}"`
      } else if (type === 'hash') {
        valCmd = `redis-cli -p ${port} HGETALL "${key}"`
      } else if (type === 'list') {
        valCmd = `redis-cli -p ${port} LRANGE "${key}" 0 -1`
      } else if (type === 'set') {
        valCmd = `redis-cli -p ${port} SMEMBERS "${key}"`
      } else if (type === 'zset') {
        valCmd = `redis-cli -p ${port} ZRANGE "${key}" 0 -1 WITHSCORES`
      } else {
        valCmd = `redis-cli -p ${port} DUMP "${key}"`
      }

      const valRes = await exec(valCmd)
      setSelectedRedisKey(key)
      setSelectedRedisValue(valRes.stdout || valRes.stderr || '(Trống)')
    } catch (err: any) {
      alert('Lỗi đọc key: ' + err.message)
    }
    setLoadingRedis(false)
  }

  const handleDeleteRedisKey = async (port: string, key: string) => {
    if (!confirm(`Xóa key "${key}" này chứ?`)) return
    setLoadingRedis(true)
    try {
      await exec(`redis-cli -p ${port} DEL "${key}"`)
      alert('Đã xóa key thành công!')
      await handleFetchRedisKeys(port, redisSearchPattern)
    } catch (err: any) {
      alert('Lỗi xóa: ' + err.message)
    }
    setLoadingRedis(false)
  }

  const handleDbBackupAction = async () => {
    if (!backupDbName.trim()) {
      alert('Vui lòng nhập tên Database!')
      return
    }
    if (backupActionType === 'import' && !backupSqlPath.trim()) {
      alert('Vui lòng nhập đường dẫn file SQL để import!')
      return
    }

    setRunningDbBackup(true)
    setBackupStatusMsg('Bắt đầu tiến trình...\n')
    const timestamp = Date.now()

    try {
      if (backupActionType === 'export') {
        const targetPath = `/tmp/db_${backupDbName}_${timestamp}.sql`
        setBackupStatusMsg((prev) => prev + `Đang xuất database ${backupDbName} ra ${targetPath}...\n`)
        let cmd = ''
        if (quickBackupModal?.type === 'mysql') {
          cmd = `mysqldump "${backupDbName}" > "${targetPath}"`
        } else {
          cmd = `sudo -u postgres pg_dump "${backupDbName}" > "${targetPath}"`
        }
        const res = await exec(cmd)
        if (res.code === 0) {
          setBackupStatusMsg((prev) => prev + `✅ Xuất database thành công!\nFile lưu trữ tại: ${targetPath}\nBạn có thể tải file này về máy qua SFTP.`)
          alert('Export database thành công!')
        } else {
          throw new Error(res.stderr || 'Xuất database thất bại')
        }
      } else {
        setBackupStatusMsg((prev) => prev + `Đang import ${backupSqlPath} vào database ${backupDbName}...\n`)
        let cmd = ''
        if (quickBackupModal?.type === 'mysql') {
          cmd = `mysql "${backupDbName}" < "${backupSqlPath}"`
        } else {
          cmd = `sudo -u postgres psql "${backupDbName}" < "${backupSqlPath}"`
        }
        const res = await exec(cmd)
        if (res.code === 0) {
          setBackupStatusMsg((prev) => prev + '✅ Nhập database thành công!')
          alert('Import database thành công!')
        } else {
          throw new Error(res.stderr || 'Import database thất bại')
        }
      }
    } catch (err: any) {
      setBackupStatusMsg((prev) => prev + `❌ Lỗi: ${err.message}\n`)
      alert('Lỗi: ' + err.message)
    } finally {
      setRunningDbBackup(false)
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchDatabaseInstances()
    setLoading(false)
  }, [fetchDatabaseInstances, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const interval = setInterval(fetchTunnels, 3000)
    return () => clearInterval(interval)
  }, [fetchTunnels])

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {dbInstances.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70] gap-3 p-6">
          <Database size={48} className="opacity-20 text-[#fab387]" />
          <div className="text-center space-y-1">
            <span className="text-xs font-bold text-[#cdd6f4] block">
              Không phát hiện hệ quản trị CSDL nào đang hoạt động
            </span>
            <span className="text-[11px] text-[#585b70] block max-w-md leading-relaxed">
              Cài đặt trực tiếp tại đây — panel sẽ tự cài, bật và khởi động dịch vụ qua apt-get (Debian/Ubuntu).
            </span>
          </div>

          {installingEngine ? (
            <div className="w-full max-w-md bg-[#181825] border border-white/5 rounded-xl p-4 space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#89b4fa] tracking-wider animate-pulse flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Đang cài đặt {installingEngine}...
              </span>
              <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[9px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                {installLog}
              </pre>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
              {(
                [
                  ['mariadb', 'MariaDB / MySQL'],
                  ['postgresql', 'PostgreSQL'],
                  ['redis', 'Redis']
                ] as const
              ).map(([engine, label]) => (
                <button
                  key={engine}
                  onClick={() => handleInstallEngine(engine)}
                  className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
                >
                  Cài {label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-4">
            {dbInstances.map((db, idx) => {
              const activeTunnel = activeTunnels.find((t) => t.targetPort === parseInt(db.port) && t.active)

              return (
                <div
                  key={idx}
                  className="bg-[#181825]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 flex flex-col justify-between hover:border-white/10 transition-all shadow-xl"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#fab387]/10 text-[#fab387] border border-[#fab387]/20">
                        <Database size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#cdd6f4] uppercase">{db.type} Server</h4>
                        <span className="text-[11px] font-mono text-[#585b70]">
                          Port {db.port} | {db.processName}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        activeTunnel
                          ? 'bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30 shadow-[0_0_8px_rgba(166,227,161,0.2)]'
                          : 'bg-white/5 text-[#585b70]'
                      }`}
                    >
                      {activeTunnel ? 'TUNNEL ACTIVE' : 'LOCAL ONLY'}
                    </span>
                  </div>

                  {activeTunnel && (
                    <div className="mt-4 bg-[#11111b] border border-white/[0.04] rounded-xl p-3 text-[11px] font-mono text-[#a6adc8] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Local Port:</span>
                        <span className="font-bold text-[#89b4fa]">{activeTunnel.listenPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Host kết nối:</span>
                        <span>localhost:{activeTunnel.listenPort}</span>
                      </div>
                    </div>
                  )}

                  {/* DB Stats */}
                  {dbStats[`${db.type}-${db.port}`] && (
                    <div className="mt-3 bg-[#11111b]/60 border border-white/[0.04] rounded-xl p-3 text-[11px] font-mono text-[#a6adc8] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Phiên bản:</span>
                        <span className="text-[#cdd6f4] truncate max-w-[150px]" title={dbStats[`${db.type}-${db.port}`].version}>
                          {dbStats[`${db.type}-${db.port}`].version}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Kết nối hiện thời:</span>
                        <span className="text-[#a6e3a1] font-bold">{dbStats[`${db.type}-${db.port}`].connections}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(db.type === 'mysql' || db.type === 'postgres') && (
                        <>
                          <button
                            onClick={async () => {
                              setLoading(true)
                              let cmd = ''
                              if (db.type === 'mysql') {
                                cmd = "mysql -e 'SHOW DATABASES' 2>/dev/null || echo 'Không có quyền'"
                              } else {
                                cmd = "sudo -u postgres psql -t -c 'SELECT datname FROM pg_database WHERE datistemplate = false' 2>/dev/null || echo 'Không có quyền'"
                              }
                              const { stdout } = await exec(cmd)
                              const dbs = stdout.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('+') && !s.startsWith('|') && s !== 'Database')
                              setDbListModal({ type: db.type, databases: dbs })
                              setLoading(false)
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-[#cdd6f4] hover:bg-white/10 border border-white/5 transition-all shadow-sm"
                          >
                            <List size={12} className="text-[#89b4fa]" /> Quản Lý DBs
                          </button>
                          <button
                            onClick={() => {
                              setQuickQueryModal({ type: db.type, port: db.port })
                              setQueryInput('')
                              setQueryResult('')
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-[#cdd6f4] hover:bg-white/10 border border-white/5 transition-all shadow-sm"
                          >
                            <Terminal size={12} className="text-[#fab387]" /> Query
                          </button>
                          <button
                            onClick={() => {
                              setBackupDbName('')
                              setBackupSqlPath('')
                              setBackupStatusMsg('')
                              setBackupActionType('export')
                              setQuickBackupModal({ type: db.type, port: db.port })
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-[#cdd6f4] hover:bg-white/10 border border-white/5 transition-all shadow-sm"
                          >
                            <DownloadCloud size={12} className="text-[#a6e3a1]" /> Backup
                          </button>
                          <button
                            onClick={() => {
                              const type = db.type as 'mysql' | 'postgres'
                              setUserModal({ type, port: db.port })
                              setNewUserName('')
                              setNewUserPassword('')
                              setNewUserHost('%')
                              setNewUserDb('')
                              fetchDbUsers(type)
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold bg-[#cba6f7]/10 text-[#cba6f7] hover:bg-[#cba6f7]/20 border border-[#cba6f7]/25 transition-all shadow-sm"
                          >
                            <Key size={12} /> Người dùng
                          </button>
                        </>
                      )}
                      {db.type === 'redis' && (
                        <button
                          onClick={() => {
                            setShowRedisExplorer({ port: db.port })
                            setRedisSearchPattern('*')
                            handleFetchRedisKeys(db.port, '*')
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-[#cba6f7]/15 hover:bg-[#cba6f7]/25 text-[#cba6f7] border border-[#cba6f7]/30 transition-all shadow-sm"
                        >
                          <Terminal size={13} /> Duyệt Key-Value Explorer
                        </button>
                      )}
                    </div>

                    {activeTunnel ? (
                      <button
                        onClick={() => handleStopTunnel(activeTunnel.id)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-[#f38ba8]/15 text-[#f38ba8] hover:bg-[#f38ba8]/25 border border-[#f38ba8]/30 transition-all active:scale-95 shadow-sm"
                      >
                        <Square size={12} />
                        Hủy SSH Tunnel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenTunnelModal(db.port, db.type)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-[#89b4fa] text-[#11111b] hover:bg-[#74c7ec] transition-all active:scale-95 shadow-sm"
                      >
                        <ArrowRight size={13} />
                        Tạo SSH Tunnel (Local Connect)
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create Tunnel Modal */}
      {showCreateTunnelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={() => setShowCreateTunnelModal(null)}
        >
          <div
            className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[420px] flex flex-col animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4] flex items-center gap-2">
                Kích hoạt SSH Tunnel ({showCreateTunnelModal.dbType.toUpperCase()})
              </h3>
              <button onClick={() => setShowCreateTunnelModal(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#a6adc8] font-semibold">Tên Kết Nối</label>
                <input
                  type="text"
                  value={tunnelNameInput}
                  onChange={(e) => setTunnelNameInput(e.target.value)}
                  className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#a6adc8] font-semibold">Cổng Cục Bộ Trên Máy Bạn (Local Listen Port)</label>
                <input
                  type="number"
                  placeholder="3307, 5433, 6380..."
                  value={tunnelLocalPortInput}
                  onChange={(e) => setTunnelLocalPortInput(e.target.value)}
                  className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono focus:border-[#89b4fa]"
                />
                <span className="text-[11px] text-[#585b70] block leading-relaxed mt-1">
                  Kết nối tới `localhost:cổng` bằng DBeaver / TablePlus / Navicat sẽ tự động thông suốt qua SSH Tunnel.
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowCreateTunnelModal(null)}
                  className="px-4 py-2 rounded-xl font-semibold bg-white/5 hover:bg-white/10 text-[#cdd6f4]"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateTunnel}
                  className="px-6 py-2 rounded-xl font-bold bg-[#89b4fa] text-[#11111b] hover:bg-[#74c7ec] active:scale-95 transition-all shadow-sm"
                >
                  Tạo Tunnel Ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DB List & Management Modal */}
      {dbListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setDbListModal(null)}>
          <div className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[520px] max-h-[75vh] flex flex-col animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4] flex items-center gap-2">
                <Database size={14} className="text-[#89b4fa]" /> Quản Lý Databases ({dbListModal.type.toUpperCase()})
              </h3>
              <button onClick={() => setDbListModal(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            {/* Quick Create Header */}
            <div className="p-4 bg-[#11111b]/60 border-b border-white/[0.04] flex gap-2">
              <input
                type="text"
                id="new_db_name_input"
                placeholder="Nhập tên Database mới..."
                className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#89b4fa]"
              />
              <button
                onClick={async () => {
                  const input = document.getElementById('new_db_name_input') as HTMLInputElement
                  if (!input || !input.value.trim()) return
                  const dbName = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '')
                  setLoading(true)
                  try {
                    let cmd = ''
                    if (dbListModal.type === 'mysql') {
                      cmd = `mysql -e "CREATE DATABASE \\\`${dbName}\\\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1`
                    } else {
                      cmd = `sudo -u postgres createdb "${dbName}" 2>&1`
                    }
                    const res = await exec(cmd)
                    if (res.code === 0) {
                      alert(`Đã tạo Database "${dbName}" thành công!`)
                      input.value = ''
                      let reloadCmd =
                        dbListModal.type === 'mysql'
                          ? "mysql -e 'SHOW DATABASES' 2>/dev/null || echo ''"
                          : "sudo -u postgres psql -t -c 'SELECT datname FROM pg_database WHERE datistemplate = false' 2>/dev/null || echo ''"
                      const { stdout } = await exec(reloadCmd)
                      const dbs = stdout
                        .split('\n')
                        .map((s) => s.trim())
                        .filter((s) => s && !s.startsWith('+') && !s.startsWith('|') && s !== 'Database')
                      setDbListModal({ type: dbListModal.type, databases: dbs })
                    } else {
                      alert('Lỗi tạo Database: ' + res.stdout)
                    }
                  } catch (e: any) {
                    alert('Lỗi: ' + e.message)
                  } finally {
                    setLoading(false)
                  }
                }}
                className="px-4 py-2 bg-[#89b4fa] text-[#11111b] rounded-xl text-xs font-bold hover:bg-[#74c7ec] transition-all shadow-sm"
              >
                + Tạo DB
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
              {dbListModal.databases.map((db, i) => (
                <div key={i} className="px-4 py-3 bg-[#11111b]/40 border border-white/[0.04] rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                  <div className="flex items-center gap-2.5">
                    <Database size={14} className="text-[#89b4fa]" />
                    <span className="text-xs font-mono font-bold text-[#cdd6f4]">{db}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setBackupDbName(db)
                        setBackupActionType('export')
                        setQuickBackupModal({ type: dbListModal.type, port: '3306' })
                      }}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] text-[#a6adc8] transition-all border border-white/5"
                    >
                      Backup
                    </button>
                    {!['information_schema', 'performance_schema', 'mysql', 'sys', 'postgres', 'template0', 'template1'].includes(db) && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Bạn có CHẮC CHẮN muốn xóa vĩnh viễn database "${db}" không?`)) return
                          setLoading(true)
                          try {
                            let cmd = dbListModal.type === 'mysql' ? `mysql -e "DROP DATABASE \\\`${db}\\\`;"` : `sudo -u postgres dropdb "${db}"`
                            const res = await exec(cmd)
                            if (res.code === 0) {
                              alert(`Đã xóa database "${db}" thành công!`)
                              setDbListModal((prev) => (prev ? { ...prev, databases: prev.databases.filter((d) => d !== db) } : null))
                            } else {
                              alert('Lỗi xóa DB: ' + res.stderr)
                            }
                          } catch (e: any) {
                            alert('Lỗi: ' + e.message)
                          } finally {
                            setLoading(false)
                          }
                        }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#f38ba8]/20 text-[#f38ba8] transition-all"
                        title="Xóa database"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {dbListModal.databases.length === 0 && <div className="text-[#585b70] text-center text-xs py-8">Không tìm thấy database nào.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Quick Query Modal */}
      {quickQueryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setQuickQueryModal(null)}>
          <div className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4]">Quick Query ({quickQueryModal.type.toUpperCase()})</h3>
              <button onClick={() => setQuickQueryModal(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            <div className="p-6 space-y-3">
              <textarea
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={quickQueryModal.type === 'mysql' ? 'SELECT * FROM users LIMIT 10;' : 'SELECT * FROM pg_stat_activity;'}
                className="w-full h-24 bg-[#11111b] border border-white/10 rounded-2xl p-3 text-xs text-[#cdd6f4] outline-none font-mono resize-none focus:border-[#89b4fa]"
              />
              <button
                onClick={async () => {
                  if (!queryInput.trim()) return
                  setLoading(true)
                  let cmd = ''
                  if (quickQueryModal.type === 'mysql') {
                    cmd = `mysql -e "${queryInput.replace(/"/g, '\\"')}" 2>&1`
                  } else {
                    cmd = `sudo -u postgres psql -c "${queryInput.replace(/"/g, '\\"')}" 2>&1`
                  }
                  const { stdout } = await exec(cmd)
                  setQueryResult(stdout || 'Không có kết quả.')
                  setLoading(false)
                }}
                className="w-full py-2 rounded-xl bg-[#89b4fa] text-[#11111b] text-xs font-bold hover:bg-[#74c7ec] transition-all shadow-sm"
              >
                Execute Query
              </button>
              {queryResult && (
                <pre className="max-h-56 overflow-auto bg-[#11111b] border border-white/[0.04] rounded-2xl p-4 text-[11px] font-mono text-[#a6adc8] whitespace-pre-wrap select-text scrollbar-thin">
                  {queryResult}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Redis Explorer Modal */}
      {showRedisExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setShowRedisExplorer(null)}>
          <div className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[740px] h-[80vh] flex flex-col animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4] flex items-center gap-2">
                <Terminal size={14} className="text-[#cba6f7]" /> Redis Key-Value Explorer (Port: {showRedisExplorer.port})
              </h3>
              <button onClick={() => setShowRedisExplorer(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            <div className="p-4 bg-[#11111b]/60 border-b border-white/[0.04] flex gap-2">
              <input
                type="text"
                value={redisSearchPattern}
                onChange={(e) => setRedisSearchPattern(e.target.value)}
                placeholder="Nhập pattern tìm kiếm (ví dụ: user:*, *)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFetchRedisKeys(showRedisExplorer.port, redisSearchPattern)
                  }
                }}
                className="flex-1 bg-[#181825] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none focus:border-[#cba6f7]"
              />
              <button
                onClick={() => handleFetchRedisKeys(showRedisExplorer.port, redisSearchPattern)}
                className="px-5 py-2 rounded-xl bg-[#cba6f7] text-[#11111b] text-xs font-bold hover:bg-[#b4befe] shadow-sm transition-all"
              >
                Tìm Kiếm
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-72 min-w-72 border-r border-white/5 flex flex-col overflow-hidden bg-[#11111b]/20">
                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                  {loadingRedis && redisKeys.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-12 animate-pulse">Đang tải keys...</div>
                  ) : redisKeys.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-12">Không tìm thấy key nào.</div>
                  ) : (
                    redisKeys.map((key) => (
                      <div
                        key={key}
                        onClick={() => handleReadRedisKey(showRedisExplorer.port, key)}
                        className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono text-left cursor-pointer transition-all ${
                          selectedRedisKey === key ? 'bg-[#cba6f7]/15 text-[#cba6f7] font-bold border border-[#cba6f7]/30' : 'text-[#a6adc8] hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="truncate flex-1 mr-2">{key}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteRedisKey(showRedisExplorer.port, key)
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#f38ba8]/20 text-[#f38ba8] transition-all"
                          title="Xóa Key"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden bg-[#11111b]/30 p-5">
                {selectedRedisKey ? (
                  <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                    <div className="flex justify-between items-center bg-[#11111b] border border-white/5 p-3 rounded-2xl text-xs font-mono">
                      <span className="text-[#585b70]">Key: <span className="text-[#cdd6f4] font-bold select-text">{selectedRedisKey}</span></span>
                      <span className="bg-[#cba6f7]/15 text-[#cba6f7] px-2 py-0.5 rounded-md text-[10px] font-bold font-sans uppercase">
                        {selectedRedisType}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      <label className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider mb-1.5">Giá trị (Value)</label>
                      <pre className="flex-1 overflow-auto bg-[#11111b] border border-white/[0.04] p-4 rounded-2xl font-mono text-xs text-[#cdd6f4] whitespace-pre-wrap select-text scrollbar-thin">
                        {selectedRedisValue}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#585b70] text-xs">
                    Chọn một key từ danh sách bên trái để xem giá trị chi tiết
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick DB Backup/Restore Modal */}
      {quickBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setQuickBackupModal(null)}>
          <div className="bg-[#181825] border border-white/10 rounded-3xl shadow-2xl w-[480px] max-h-[85vh] flex flex-col animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#11111b]/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#cdd6f4]">
                Sao lưu & Phục hồi ({quickBackupModal.type.toUpperCase()})
              </h3>
              <button onClick={() => setQuickBackupModal(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto scrollbar-thin">
              <div className="flex gap-2 p-1 bg-[#11111b] border border-white/5 rounded-xl">
                <button
                  onClick={() => setBackupActionType('export')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${backupActionType === 'export' ? 'bg-[#89b4fa] text-[#11111b]' : 'text-[#a6adc8] hover:text-[#cdd6f4]'}`}
                >
                  Export (Backup)
                </button>
                <button
                  onClick={() => setBackupActionType('import')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${backupActionType === 'import' ? 'bg-[#89b4fa] text-[#11111b]' : 'text-[#a6adc8] hover:text-[#cdd6f4]'}`}
                >
                  Import (Restore)
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#a6adc8] font-semibold">Tên Database *</label>
                <input
                  type="text"
                  placeholder="wordpress_db"
                  value={backupDbName}
                  onChange={(e) => setBackupDbName(e.target.value)}
                  className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono focus:border-[#89b4fa]"
                  disabled={runningDbBackup}
                />
              </div>

              {backupActionType === 'import' && (
                <div className="space-y-1.5">
                  <label className="text-[#a6adc8] font-semibold">Đường dẫn file SQL nguồn (.sql) *</label>
                  <input
                    type="text"
                    placeholder="/tmp/db_wordpress_db_123456.sql"
                    value={backupSqlPath}
                    onChange={(e) => setBackupSqlPath(e.target.value)}
                    className="w-full bg-[#11111b] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono focus:border-[#89b4fa]"
                    disabled={runningDbBackup}
                  />
                </div>
              )}

              {backupStatusMsg && (
                <div className="space-y-1.5">
                  <pre className="h-32 overflow-y-auto p-3 bg-[#11111b] rounded-2xl font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                    {backupStatusMsg}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setQuickBackupModal(null)}
                  className="px-4 py-2 rounded-xl font-semibold bg-white/5 hover:bg-white/10 text-[#cdd6f4]"
                  disabled={runningDbBackup}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleDbBackupAction}
                  disabled={runningDbBackup}
                  className="px-6 py-2 rounded-xl font-bold bg-[#89b4fa] text-[#11111b] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                >
                  {runningDbBackup ? 'Đang thực hiện...' : backupActionType === 'export' ? 'Bắt đầu Export' : 'Bắt đầu Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Người dùng database Modal */}
      {userModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setUserModal(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[640px] max-w-[94vw] max-h-[86vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Key size={13} />
                Người dùng {userModal.type === 'mysql' ? 'MySQL / MariaDB' : 'PostgreSQL'} · cổng {userModal.port}
              </h3>
              <button
                onClick={() => setUserModal(null)}
                className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8]">
                    Danh sách user ({dbUsers.length})
                  </span>
                  <button
                    onClick={() => fetchDbUsers(userModal.type)}
                    disabled={loadingUsers}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-40 flex items-center gap-1"
                  >
                    <RefreshCw size={10} className={loadingUsers ? 'animate-spin' : ''} /> Làm mới
                  </button>
                </div>

                {loadingUsers && <div className="text-center text-xs text-[#585b70] py-4">Đang tải...</div>}

                {!loadingUsers && dbUsers.length === 0 && (
                  <div className="text-center text-xs text-[#45475a] py-4">
                    Không đọc được user nào. Cần quyền sudo truy cập MySQL/Postgres.
                  </div>
                )}

                {dbUsers.map((user) => (
                  <div
                    key={`${user.name}@${user.host}`}
                    className="bg-[#181825] border border-white/[0.04] rounded-xl px-3 py-2 flex flex-wrap items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#cdd6f4]">{user.name}</span>
                        {user.host !== '-' && <span className="text-[10px] font-mono text-[#585b70]">@{user.host}</span>}
                        {user.superuser && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f9e2af]/15 text-[#f9e2af] font-bold">
                            SUPERUSER
                          </span>
                        )}
                        {!user.canLogin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#585b70]/20 text-[#a6adc8] font-bold">
                            NO LOGIN
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleShowGrants(user)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8]"
                      >
                        Xem quyền
                      </button>
                      <button
                        onClick={() => handleChangeDbUserPassword(user)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-[#f9e2af]/15 hover:bg-[#f9e2af]/25 text-[#f9e2af]"
                      >
                        Đổi mật khẩu
                      </button>
                      <button
                        onClick={() => handleDropDbUser(user)}
                        className="p-1.5 rounded-lg bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#f38ba8]"
                        title="Xóa user"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-3 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
                  <Plus size={11} /> Tạo user mới
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-[10px] text-[#585b70] space-y-1 block">
                    Tên user *
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="webapp_user"
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                    />
                  </label>
                  <label className="text-[10px] text-[#585b70] space-y-1 block">
                    Mật khẩu *
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="tối thiểu 6 ký tự"
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                    />
                  </label>

                  {userModal.type === 'mysql' && (
                    <label className="text-[10px] text-[#585b70] space-y-1 block">
                      Host được phép kết nối
                      <input
                        type="text"
                        value={newUserHost}
                        onChange={(e) => setNewUserHost(e.target.value)}
                        placeholder="% hoặc 127.0.0.1"
                        className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      />
                    </label>
                  )}

                  <label className="text-[10px] text-[#585b70] space-y-1 block">
                    Database áp dụng
                    <input
                      type="text"
                      value={newUserDb}
                      onChange={(e) => setNewUserDb(e.target.value)}
                      placeholder={userModal.type === 'mysql' ? '* (tất cả)' : 'postgres'}
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                    />
                  </label>

                  <label className="text-[10px] text-[#585b70] space-y-1 block md:col-span-2">
                    Quyền được cấp
                    <select
                      value={newUserGrants}
                      onChange={(e) => setNewUserGrants(e.target.value)}
                      className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none"
                    >
                      <option value="ALL PRIVILEGES">ALL PRIVILEGES (toàn quyền)</option>
                      <option value="SELECT">SELECT (chỉ đọc)</option>
                      <option value="SELECT, INSERT, UPDATE, DELETE">SELECT, INSERT, UPDATE, DELETE</option>
                      <option value="CREATE, ALTER, DROP, INDEX">
                        {userModal.type === 'mysql' ? 'CREATE, ALTER, DROP, INDEX' : 'CREATE'}
                      </option>
                      <option value="CONNECT">CONNECT (chỉ kết nối)</option>
                    </select>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleCreateDbUser}
                    disabled={creatingUser}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] disabled:opacity-40"
                  >
                    {creatingUser ? 'Đang tạo...' : 'Tạo user'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grants viewer */}
      {grantsModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setGrantsModal(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[560px] max-w-[92vw] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">{grantsModal.title}</h3>
              <button
                onClick={() => setGrantsModal(null)}
                className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto scrollbar-thin bg-[#11111b] m-4 p-3 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap select-text">
              {grantsModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
