import { useState, useEffect, useCallback } from 'react'
import { X, ArrowUp, Folder, File, RefreshCw, CornerDownLeft } from 'lucide-react'

function joinPath(base: string, name: string): string {
  const root = base === '/' ? '' : base.replace(/\/+$/, '')
  return `${root}/${name}`
}

export interface RemotePathPickerProps {
  visible: boolean
  mode: 'file' | 'dir'
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  onClose: () => void
  onSelect: (path: string) => void
  startPath?: string
  title?: string
}

/**
 * Browses files/directories on the remote host over the existing SSH exec
 * channel. Shared by the panels added after the original per-panel copies.
 */
export default function RemotePathPicker({
  visible,
  mode,
  exec,
  onClose,
  onSelect,
  startPath = '/',
  title
}: RemotePathPickerProps) {
  const [currentPath, setCurrentPath] = useState(startPath)
  const [items, setItems] = useState<{ name: string; isDir: boolean }[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDir = useCallback(
    async (path: string) => {
      setLoading(true)
      try {
        const sanitizedPath = path.replace(/"/g, '\\"')
        const res = await exec(`cd "${sanitizedPath}" 2>/dev/null && pwd && echo "===LIST===" && ls -F -1`)
        if (res.code !== 0) {
          alert('Không đọc được thư mục: ' + (res.stderr || path))
          return
        }

        const lines = res.stdout.split('\n')
        const resolved = lines[0].trim() || path
        const separator = lines.findIndex((line) => line.trim() === '===LIST===')

        const parsed = lines
          .slice(separator + 1)
          .map((f) => f.trim())
          .filter((f) => f && f !== './' && f !== '../' && f !== '===LIST===')
          .map((f) => {
            const isDir = f.endsWith('/')
            return { name: isDir ? f.slice(0, -1) : f, isDir }
          })

        parsed.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })

        setItems(parsed)
        setCurrentPath(resolved)
      } catch (e: any) {
        alert('Lỗi: ' + e.message)
      } finally {
        setLoading(false)
      }
    },
    [exec]
  )

  useEffect(() => {
    if (visible) fetchDir(startPath)
  }, [visible, startPath, fetchDir])

  if (!visible) return null

  const goUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    fetchDir('/' + parts.join('/'))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] h-[500px] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#181825] shrink-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
            {title || (mode === 'file' ? 'Chọn tệp trên server' : 'Chọn thư mục trên server')}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
            <X size={14} />
          </button>
        </div>

        <div className="p-2.5 bg-[#11111b] border-b border-white/5 flex gap-2 items-center shrink-0">
          <button
            onClick={goUp}
            disabled={currentPath === '/'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] disabled:opacity-30 shrink-0"
            title="Lên thư mục cha"
          >
            <ArrowUp size={12} />
          </button>
          <input
            type="text"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchDir(currentPath)}
            className="flex-1 min-w-0 bg-[#181825] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono"
          />
          <button
            onClick={() => fetchDir(currentPath)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] shrink-0"
            title="Mở"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <CornerDownLeft size={12} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {items.length === 0 && !loading && (
            <div className="text-center text-xs text-[#45475a] py-8">Thư mục trống</div>
          )}
          {items.map((item) => (
            <div
              key={item.name}
              onClick={() =>
                item.isDir ? fetchDir(joinPath(currentPath, item.name)) : onSelect(joinPath(currentPath, item.name))
              }
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer group"
            >
              {item.isDir ? (
                <Folder size={12} className="text-[#89b4fa] shrink-0" />
              ) : (
                <File size={12} className="text-[#6c7086] shrink-0" />
              )}
              <span className="text-xs text-[#cdd6f4] truncate">{item.name}</span>
              {!item.isDir && mode === 'file' && (
                <span className="ml-auto text-[9px] text-[#89b4fa] opacity-0 group-hover:opacity-100 shrink-0">
                  Chọn
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-white/5 bg-[#181825] flex gap-2 justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10">
            Hủy
          </button>
          {mode === 'dir' && (
            <button
              onClick={() => onSelect(currentPath)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec]"
            >
              Chọn thư mục này
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
