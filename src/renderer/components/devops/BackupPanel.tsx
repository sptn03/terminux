import { useState } from 'react'
import { DownloadCloud } from 'lucide-react'

interface BackupPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  setLoading: (loading: boolean) => void
}

export default function BackupPanel({
  sessionId,
  exec,
  setLoading
}: BackupPanelProps) {
  const [backupPath, setBackupPath] = useState('/var/www')
  const [backupType, setBackupType] = useState<'dir' | 'mysql'>('dir')
  const [backupStatus, setBackupStatus] = useState<string | null>(null)

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
    } else {
      const dbName = (document.getElementById('db_name_input') as HTMLInputElement)?.value || ''
      const dbUser = (document.getElementById('db_user_input') as HTMLInputElement)?.value || 'root'
      const dbPass = (document.getElementById('db_pass_input') as HTMLInputElement)?.value || ''

      if (!dbName) {
        alert('Vui lòng nhập tên Database')
        setLoading(false)
        return
      }

      setBackupStatus((prev) => prev + `Đang chạy mysqldump cho database ${dbName}...\n`)
      const dumpCmd = `mysqldump -u "${dbUser}" -p"${dbPass}" "${dbName}" > /tmp/db_${dbName}_${timestamp}.sql`
      const result = await exec(dumpCmd)

      if (result.code === 0) {
        setBackupStatus(
          (prev) => prev + `✅ Xuất database thành công!\nTệp backup tại: /tmp/db_${dbName}_${timestamp}.sql\nBạn có thể quản lý và tải về qua SFTP.`
        )
      } else {
        setBackupStatus((prev) => prev + `❌ Lỗi xuất database: ${result.stderr}`)
      }
    }
    setLoading(false)
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
              Thư mục nguồn
            </button>
            <button
              onClick={() => setBackupType('mysql')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                backupType === 'mysql' ? 'bg-[#89b4fa] text-[#1e1e2e]' : 'bg-[#11111b] text-[#a6adc8]'
              }`}
            >
              Database MySQL
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
                id="db_name_input"
                placeholder="wordpress_db"
                className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">MySQL User</label>
              <input
                type="text"
                id="db_user_input"
                placeholder="root"
                className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">MySQL Password</label>
              <input
                type="password"
                id="db_pass_input"
                className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleStartBackup}
          className="w-full py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all flex items-center justify-center gap-1.5"
        >
          <DownloadCloud size={12} /> Bắt đầu Sao lưu
        </button>
      </div>

      {/* Console progress of backup/restore */}
      <div className="flex-1 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-4">
        <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-2">Trạng thái tác vụ Backup/Restore</span>
        <pre className="flex-1 overflow-y-auto font-mono text-xs text-[#a6adc8] whitespace-pre-wrap select-text bg-[#181825] p-3 rounded-lg border border-white/[0.02]">
          {backupStatus || 'Sẵn sàng.'}
        </pre>
      </div>
    </div>
  )
}
