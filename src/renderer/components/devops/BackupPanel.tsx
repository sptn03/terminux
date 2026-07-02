import { useState, useEffect, useCallback } from 'react'
import { DownloadCloud, RotateCw, Trash2, X, Clock } from 'lucide-react'

interface BackupPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  setLoading: (loading: boolean) => void
}

interface BackupHistoryItem {
  path: string
  size: string
  date: string
}

export default function BackupPanel({
  sessionId,
  exec,
  setLoading
}: BackupPanelProps) {
  const [backupPath, setBackupPath] = useState('/var/www')
  const [backupType, setBackupType] = useState<'dir' | 'mysql' | 'postgres'>('dir')
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([])

  // Backup Cron Schedule states
  const [showCronModal, setShowCronModal] = useState(false)
  const [cronSchedule, setCronSchedule] = useState('0 2 * * *')

  // React controlled state for DB credentials
  const [dbName, setDbName] = useState('')
  const [dbUser, setDbUser] = useState('root')
  const [dbPass, setDbPass] = useState('')

  const fetchBackupHistory = useCallback(async () => {
    try {
      const { stdout } = await exec('ls -lh /tmp/backup_* /tmp/db_* 2>/dev/null || echo ""')
      if (!stdout.trim()) {
        setBackupHistory([])
        return
      }
      const items: BackupHistoryItem[] = stdout.split('\n').filter(Boolean).map((line) => {
        const parts = line.trim().replace(/\s+/g, ' ').split(' ')
        if (parts.length < 9) return null
        return {
          size: parts[4],
          date: `${parts[5]} ${parts[6]} ${parts[7]}`,
          path: parts.slice(8).join(' ')
        }
      }).filter(Boolean) as BackupHistoryItem[]
      setBackupHistory(items)
    } catch {}
  }, [exec])

  useEffect(() => {
    fetchBackupHistory()
  }, [fetchBackupHistory])

  const handleStartBackup = async () => {
    setLoading(true)
    setBackupStatus('Đang khởi tạo tiến trình sao lưu...\n')
    const timestamp = Date.now()

    if (backupType === 'dir') {
      const cleanPath = backupPath.trim()
      const lastSlash = cleanPath.lastIndexOf('/')
      const parentDir = lastSlash !== -1 ? cleanPath.substring(0, lastSlash) : '/'
      const targetName = lastSlash !== -1 ? cleanPath.substring(lastSlash + 1) : cleanPath

      setBackupStatus((prev) => prev + `Đang nén thư mục ${cleanPath}...\n`)
      const tarCmd = `tar -czf /tmp/backup_${timestamp}.tar.gz -C "${parentDir}" "${targetName}"`
      const result = await exec(tarCmd)

      if (result.code === 0) {
        setBackupStatus(
          (prev) =>
            prev +
            `✅ Sao lưu thành công!\nTệp lưu trữ tạm thời tại: /tmp/backup_${timestamp}.tar.gz\nBạn có thể tải tệp này về máy cục bộ qua tính năng SFTP.`
        )
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi nén file: ${result.stderr}`)
      }
    } else if (backupType === 'mysql') {
      if (!dbName) {
        alert('Vui lòng nhập tên Database')
        setLoading(false)
        return
      }

      setBackupStatus((prev) => prev + `Đang chạy mysqldump cho database ${dbName}...\n`)
      const passArg = dbPass ? `-p"${dbPass}"` : ''
      const dumpCmd = `mysqldump -u "${dbUser}" ${passArg} "${dbName}" > /tmp/db_${dbName}_${timestamp}.sql`
      const result = await exec(dumpCmd)

      if (result.code === 0) {
        setBackupStatus(
          (prev) => prev + `✅ Xuất database thành công!\nTệp backup tại: /tmp/db_${dbName}_${timestamp}.sql\nBạn có thể quản lý và tải về qua SFTP.`
        )
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi xuất database: ${result.stderr}`)
      }
    } else {
      // postgres
      if (!dbName) {
        alert('Vui lòng nhập tên Database')
        setLoading(false)
        return
      }

      setBackupStatus((prev) => prev + `Đang chạy pg_dump cho database ${dbName}...\n`)
      const dumpCmd = `sudo -u postgres pg_dump "${dbName}" > /tmp/db_${dbName}_${timestamp}.sql`
      const result = await exec(dumpCmd)

      if (result.code === 0) {
        setBackupStatus(
          (prev) => prev + `✅ Xuất PostgreSQL thành công!\nTệp backup tại: /tmp/db_${dbName}_${timestamp}.sql`
        )
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi xuất database: ${result.stderr}`)
      }
    }

    await fetchBackupHistory()
    setLoading(false)
  }

  const handleRestore = async (item: BackupHistoryItem) => {
    if (item.path.endsWith('.tar.gz')) {
      const targetDir = prompt('Nhập đường dẫn thư mục đích để giải nén:', '/var/www')
      if (!targetDir) return
      setLoading(true)
      setBackupStatus(`Đang giải nén ${item.path} vào ${targetDir}...\n`)
      const result = await exec(`tar -xzf "${item.path}" -C "${targetDir}"`)
      if (result.code === 0) {
        setBackupStatus((prev) => prev + `✅ Giải nén thành công vào ${targetDir}`)
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi giải nén: ${result.stderr}`)
      }
      setLoading(false)
    } else if (item.path.endsWith('.sql')) {
      const targetDb = prompt('Nhập tên database đích để import:', '')
      if (!targetDb) return
      setLoading(true)
      setBackupStatus(`Đang import ${item.path} vào database ${targetDb}...\n`)
      // Auto-detect mysql vs postgres from filename or let user decide
      const isMysql = item.path.includes('mysql') || !item.path.includes('pg_')
      let cmd: string
      if (isMysql) {
        cmd = `mysql "${targetDb}" < "${item.path}"`
      } else {
        cmd = `sudo -u postgres psql "${targetDb}" < "${item.path}"`
      }
      const result = await exec(cmd)
      if (result.code === 0) {
        setBackupStatus((prev) => prev + `✅ Import thành công vào ${targetDb}`)
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi import: ${result.stderr}`)
      }
      setLoading(false)
    }
  }

  const handleDeleteBackup = async (item: BackupHistoryItem) => {
    if (!confirm(`Xóa bản backup ${item.path}?`)) return
    setLoading(true)
    await exec(`rm -f "${item.path}"`)
    await fetchBackupHistory()
    setLoading(false)
  }

  const handleSaveBackupCron = async () => {
    setLoading(true)
    try {
      let backupCmd = ''
      if (backupType === 'dir') {
        const cleanPath = backupPath.trim()
        const lastSlash = cleanPath.lastIndexOf('/')
        const parentDir = lastSlash !== -1 ? cleanPath.substring(0, lastSlash) : '/'
        const targetName = lastSlash !== -1 ? cleanPath.substring(lastSlash + 1) : cleanPath
        backupCmd = `tar -czf /tmp/backup_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).tar.gz -C "${parentDir}" "${targetName}"`
      } else if (backupType === 'mysql') {
        if (!dbName) {
          alert('Vui lòng nhập tên Database!')
          setLoading(false)
          return
        }
        const passArg = dbPass ? `-p"${dbPass}"` : ''
        backupCmd = `mysqldump -u "${dbUser}" ${passArg} "${dbName}" > /tmp/db_${dbName}_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).sql`
      } else {
        if (!dbName) {
          alert('Vui lòng nhập tên Database!')
          setLoading(false)
          return
        }
        backupCmd = `sudo -u postgres pg_dump "${dbName}" > /tmp/db_${dbName}_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).sql`
      }

      const cronJobLine = `${cronSchedule} ${backupCmd}`
      const checkCron = await exec("crontab -l 2>/dev/null || echo ''")
      const jobs = checkCron.stdout.split('\n').filter(Boolean)
      jobs.push(cronJobLine)
      
      const sanitizeForShell = (str: string) => str.replace(/["$`\\!]/g, '\\$&')
      const newCronString = sanitizeForShell(jobs.join('\n'))
      const writeRes = await exec(`echo "${newCronString}" | crontab -`)

      if (writeRes.code === 0) {
        setBackupStatus(`✅ Đã đặt lịch backup thành công!\nCron Job: ${cronJobLine}\nBạn có thể kiểm tra hoặc quản lý lịch trình này ở tab Cron Jobs.`)
        alert('Cấu hình lịch backup thành công!')
        setShowCronModal(false)
      } else {
        throw new Error(writeRes.stderr || 'Không thể cập nhật crontab')
      }
    } catch (err: any) {
      alert('Lỗi đặt lịch: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      <div className="w-96 min-w-96 bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-4 overflow-y-auto scrollbar-thin">
        <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] block">Tạo bản sao lưu (Backup)</span>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Loại sao lưu</label>
          <div className="flex gap-2">
            <button
              onClick={() => setBackupType('dir')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                backupType === 'dir' ? 'bg-[#89b4fa] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'
              }`}
            >
              Thư mục
            </button>
            <button
              onClick={() => setBackupType('mysql')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                backupType === 'mysql' ? 'bg-[#89b4fa] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'
              }`}
            >
              MySQL
            </button>
            <button
              onClick={() => setBackupType('postgres')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                backupType === 'postgres' ? 'bg-[#89b4fa] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'
              }`}
            >
              PostgreSQL
            </button>
          </div>
        </div>

        {backupType === 'dir' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Đường dẫn thư mục</label>
            <input
              type="text"
              value={backupPath}
              onChange={(e) => setBackupPath(e.target.value)}
              className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Tên Database</label>
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="wordpress_db"
                className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
              />
            </div>
            {backupType === 'mysql' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">MySQL User</label>
                  <input
                    type="text"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    placeholder="root"
                    className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">MySQL Password</label>
                  <input
                    type="password"
                    value={dbPass}
                    onChange={(e) => setDbPass(e.target.value)}
                    className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  />
                </div>
              </>
            )}
            {backupType === 'postgres' && (
              <div className="text-[10px] text-[#585b70] bg-[#11111b] rounded-lg p-2.5 leading-relaxed">
                PostgreSQL sử dụng xác thực qua <code className="text-[#89b4fa]">sudo -u postgres</code>. Không cần nhập mật khẩu.
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleStartBackup}
            className="flex-1 py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all flex items-center justify-center gap-1.5"
          >
            <DownloadCloud size={12} /> Bắt đầu Sao lưu
          </button>
          <button
            onClick={() => setShowCronModal(true)}
            className="flex-1 py-2 rounded-lg bg-[#a6e3a1]/10 text-[#a6e3a1] text-xs font-bold hover:bg-[#a6e3a1]/25 transition-all flex items-center justify-center gap-1.5"
            title="Đặt lịch backup tự động"
          >
            <Clock size={12} /> Đặt lịch Cron
          </button>
        </div>

        {/* Backup History */}
        {backupHistory.length > 0 && (
          <div className="border-t border-white/[0.04] pt-4 space-y-2">
            <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Lịch sử Backup ({backupHistory.length})</span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {backupHistory.map((item, idx) => (
                <div key={idx} className="bg-[#11111b] border border-white/[0.02] rounded-lg p-2 flex items-center justify-between text-[10px]">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[#cdd6f4] truncate" title={item.path}>
                      {item.path.substring(item.path.lastIndexOf('/') + 1)}
                    </div>
                    <div className="text-[#585b70]">{item.size} • {item.date}</div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => handleRestore(item)}
                      className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                      title="Restore"
                    >
                      <RotateCw size={10} />
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(item)}
                      className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                      title="Xóa"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Console progress of backup/restore */}
      <div className="flex-1 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-4">
        <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-2">Trạng thái tác vụ Backup/Restore</span>
        <pre className="flex-1 overflow-y-auto font-mono text-xs text-[#a6adc8] whitespace-pre-wrap select-text bg-[#181825] p-3 rounded-lg border border-white/[0.02]">
          {backupStatus || 'Sẵn sàng.'}
        </pre>
      </div>

      {/* Backup Cron Modal */}
      {showCronModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCronModal(false)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Đặt lịch sao lưu tự động</h3>
              <button onClick={() => setShowCronModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tần suất chạy (Cron Expression) *</label>
                <input
                  type="text"
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono focus:border-[#89b4fa]/50"
                  placeholder="0 2 * * *"
                />
                
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-[9px] text-[#585b70]">
                  <button onClick={() => setCronSchedule('0 2 * * *')} className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]">
                    Hàng ngày lúc 2:00 sáng
                  </button>
                  <button onClick={() => setCronSchedule('0 12 * * *')} className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]">
                    Hàng ngày lúc 12:00 trưa
                  </button>
                  <button onClick={() => setCronSchedule('0 0 * * 0')} className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]">
                    Mỗi chủ nhật 0:00 sáng
                  </button>
                  <button onClick={() => setCronSchedule('0 0 1 * *')} className="px-1.5 py-0.5 rounded bg-[#11111b] hover:bg-white/5 text-left text-[#bac2de]">
                    Ngày 1 hàng tháng 0:00
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-[#585b70] bg-[#11111b] rounded-lg p-2.5 leading-relaxed">
                Tác vụ sao lưu tự động sẽ nén/xuất tệp tin vào thư mục <code className="text-[#89b4fa]">/tmp</code> trên server. Bạn có thể thay đổi lịch trình bất kỳ lúc nào thông qua tab <strong>Cron Jobs</strong>.
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCronModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveBackupCron}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Lưu & Lên Lịch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
