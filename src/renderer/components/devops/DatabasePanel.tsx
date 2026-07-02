import { useState, useEffect, useCallback } from 'react'
import { Database, Square, ArrowRight, X, Terminal, List } from 'lucide-react'

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

      // Fetch stats for detected instances
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
      const keys = stdout.split('\n').map(s => s.trim()).filter(Boolean)
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {dbInstances.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <Database size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Không phát hiện hệ quản trị CSDL nào đang hoạt động</span>
          <span className="text-[10px] mt-1 text-[#45475a] max-w-xs text-center leading-relaxed">
            Để sử dụng tính năng này, hãy đảm bảo MySQL, Postgres, Redis hoặc MongoDB đang lắng nghe trên server.
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-4">
            {dbInstances.map((db, idx) => {
              const activeTunnel = activeTunnels.find((t) => t.targetPort === parseInt(db.port) && t.active)

              return (
                <div
                  key={idx}
                  className="bg-[#181825] border border-white/[0.04] rounded-xl p-5 flex flex-col justify-between hover:border-white/[0.08] transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[#fab387]/10 text-[#fab387]">
                        <Database size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#cdd6f4] uppercase">{db.type} Server</h4>
                        <span className="text-[10px] font-mono text-[#585b70]">
                          Port {db.port} | {db.processName}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                        activeTunnel ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'
                      }`}
                    >
                      {activeTunnel ? 'Tunnel Active' : 'Disconnected'}
                    </span>
                  </div>

                  {activeTunnel && (
                    <div className="mt-4 bg-[#11111b] border border-white/[0.02] rounded-lg p-2.5 text-[10px] font-mono text-[#a6adc8] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Cổng Cục Bộ:</span>
                        <span className="font-bold text-[#89b4fa]">{activeTunnel.listenPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Kết Nối:</span>
                        <span>localhost:{activeTunnel.listenPort}</span>
                      </div>
                    </div>
                  )}

                  {/* DB Stats */}
                  {dbStats[`${db.type}-${db.port}`] && (
                    <div className="mt-3 bg-[#11111b] border border-white/[0.02] rounded-lg p-2.5 text-[10px] font-mono text-[#a6adc8] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Version:</span>
                        <span className="text-[#cdd6f4] truncate max-w-[150px]" title={dbStats[`${db.type}-${db.port}`].version}>{dbStats[`${db.type}-${db.port}`].version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#585b70]">Connections:</span>
                        <span className="text-[#a6e3a1] font-bold">{dbStats[`${db.type}-${db.port}`].connections}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
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
                              const dbs = stdout.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('+') && !s.startsWith('|') && s !== 'Database')
                              setDbListModal({ type: db.type, databases: dbs })
                              setLoading(false)
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-[#a6adc8] hover:bg-white/10 transition-all"
                          >
                            <List size={10} /> DBs
                          </button>
                          <button
                            onClick={() => { setQuickQueryModal({ type: db.type, port: db.port }); setQueryInput(''); setQueryResult('') }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-[#a6adc8] hover:bg-white/10 transition-all"
                          >
                            <Terminal size={10} /> Query
                          </button>
                          <button
                            onClick={() => {
                              setBackupDbName('')
                              setBackupSqlPath('')
                              setBackupStatusMsg('')
                              setBackupActionType('export')
                              setQuickBackupModal({ type: db.type, port: db.port })
                            }}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-[#a6adc8] hover:bg-white/10 transition-all"
                          >
                            Backup
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
                          className="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-[#a6adc8] hover:bg-white/10 transition-all"
                        >
                          <Terminal size={10} /> Duyệt Key-Value
                        </button>
                      )}
                    </div>

                    {activeTunnel ? (
                      <button
                        onClick={() => handleStopTunnel(activeTunnel.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 transition-all active:scale-95"
                      >
                        <Square size={11} />
                        Hủy SSH Tunnel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenTunnelModal(db.port, db.type)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-all active:scale-95"
                      >
                        <ArrowRight size={11} />
                        Tạo SSH Tunnel
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCreateTunnelModal(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                Kích hoạt SSH Tunnel ({showCreateTunnelModal.dbType.toUpperCase()})
              </h3>
              <button onClick={() => setShowCreateTunnelModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên Kết Nối (Tunnel Name)</label>
                <input
                  type="text"
                  value={tunnelNameInput}
                  onChange={(e) => setTunnelNameInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Cổng Cục Bộ Máy Bạn (Local Listen Port)</label>
                <input
                  type="number"
                  placeholder="3307, 5433, 6380..."
                  value={tunnelLocalPortInput}
                  onChange={(e) => setTunnelLocalPortInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
                <span className="text-[10px] text-[#585b70] block leading-relaxed">
                  Cổng này sẽ được mở trên máy tính cá nhân của bạn. Kết nối tới `localhost:cổng` sẽ tự động chuyển hướng tới database trên server.
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTunnelModal(null)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateTunnel}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Tạo Tunnel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* DB List Modal */}
      {dbListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDbListModal(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] max-h-[60vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Databases ({dbListModal.type.toUpperCase()})</h3>
              <button onClick={() => setDbListModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {dbListModal.databases.map((db, i) => (
                <div key={i} className="px-3 py-2 bg-[#181825] border border-white/[0.04] rounded-lg text-xs font-mono text-[#cdd6f4]">{db}</div>
              ))}
              {dbListModal.databases.length === 0 && <div className="text-[#585b70] text-center text-xs py-4">Không tìm thấy database nào.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Quick Query Modal */}
      {quickQueryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQuickQueryModal(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Quick Query ({quickQueryModal.type.toUpperCase()})</h3>
              <button onClick={() => setQuickQueryModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={quickQueryModal.type === 'mysql' ? 'SELECT * FROM users LIMIT 10;' : 'SELECT * FROM pg_stat_activity;'}
                className="w-full h-20 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono resize-none"
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
                className="w-full py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
              >
                Execute Query
              </button>
              {queryResult && (
                <pre className="max-h-48 overflow-auto bg-[#11111b] border border-white/[0.04] rounded-lg p-3 text-[11px] font-mono text-[#a6adc8] whitespace-pre-wrap select-text">
                  {queryResult}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Redis Explorer Modal */}
      {showRedisExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRedisExplorer(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[700px] h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                Redis Key-Value Explorer (Cổng: {showRedisExplorer.port})
              </h3>
              <button onClick={() => setShowRedisExplorer(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-4 bg-[#11111b] border-b border-white/5 flex gap-2">
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
                className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none"
              />
              <button
                onClick={() => handleFetchRedisKeys(showRedisExplorer.port, redisSearchPattern)}
                className="px-4 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec]"
              >
                Tìm kiếm
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-64 min-w-64 border-r border-white/5 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
                  {loadingRedis && redisKeys.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-8 animate-pulse">Đang tải...</div>
                  ) : redisKeys.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-8">Không tìm thấy key nào.</div>
                  ) : (
                    redisKeys.map((key) => (
                      <div
                        key={key}
                        onClick={() => handleReadRedisKey(showRedisExplorer.port, key)}
                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left cursor-pointer transition-all select-text ${
                          selectedRedisKey === key ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#a6adc8] hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className="truncate flex-1 mr-2">{key}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteRedisKey(showRedisExplorer.port, key)
                          }}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/5 text-[#f38ba8] transition-all"
                          title="Xóa Key"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden bg-[#11111b]/20 p-4">
                {selectedRedisKey ? (
                  <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                    <div className="flex justify-between items-center bg-[#11111b] border border-white/5 p-2 rounded-lg text-xs font-mono">
                      <span className="text-[#585b70]">Key: <span className="text-[#cdd6f4] font-bold select-text">{selectedRedisKey}</span></span>
                      <span className="bg-[#cba6f7]/10 text-[#cba6f7] px-1.5 py-0.5 rounded text-[10px] font-bold font-sans uppercase">
                        {selectedRedisType}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      <label className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider mb-1">Giá trị (Value)</label>
                      <pre className="flex-1 overflow-auto bg-[#11111b] border border-white/[0.04] p-3 rounded-lg font-mono text-xs text-[#a6adc8] whitespace-pre-wrap select-text scrollbar-thin">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQuickBackupModal(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[450px] max-h-[85vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                Sao lưu & Phục hồi ({quickBackupModal.type.toUpperCase()})
              </h3>
              <button onClick={() => setQuickBackupModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            
            <div className="p-5 space-y-4 text-xs overflow-y-auto scrollbar-thin">
              <div className="flex gap-2 p-0.5 bg-[#11111b] border border-white/5 rounded-lg">
                <button
                  onClick={() => setBackupActionType('export')}
                  className={`flex-1 py-1 rounded-md transition-all ${backupActionType === 'export' ? 'bg-[#89b4fa] text-[#1e1e2e] font-bold' : 'text-[#a6adc8] hover:text-[#cdd6f4]'}`}
                >
                  Export (Backup)
                </button>
                <button
                  onClick={() => setBackupActionType('import')}
                  className={`flex-1 py-1 transition-all ${backupActionType === 'import' ? 'bg-[#89b4fa] text-[#1e1e2e] font-bold' : 'text-[#a6adc8] hover:text-[#cdd6f4]'}`}
                >
                  Import (Restore)
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên Database *</label>
                <input
                  type="text"
                  placeholder="wordpress_db"
                  value={backupDbName}
                  onChange={(e) => setBackupDbName(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  disabled={runningDbBackup}
                />
              </div>

              {backupActionType === 'import' && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Đường dẫn file SQL nguồn (.sql) *</label>
                  <input
                    type="text"
                    placeholder="/tmp/db_wordpress_db_123456.sql"
                    value={backupSqlPath}
                    onChange={(e) => setBackupSqlPath(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                    disabled={runningDbBackup}
                  />
                </div>
              )}

              {backupStatusMsg && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Tiến trình thực hiện</label>
                  <pre className="h-32 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                    {backupStatusMsg}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setQuickBackupModal(null)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                  disabled={runningDbBackup}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleDbBackupAction}
                  disabled={runningDbBackup}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {runningDbBackup ? 'Đang thực hiện...' : backupActionType === 'export' ? 'Bắt đầu Export' : 'Bắt đầu Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
