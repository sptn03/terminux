import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Folder, File, FileUp, FileDown, Trash2, FolderPlus, ChevronRight, Home, RefreshCw, Loader2, X, Eye, Upload, Copy, Edit3, ArrowRight, Search, HardDrive, ArrowLeftRight, Star } from 'lucide-react'
import type { LocalEntry } from '../../types'

function InputDialog({ title, defaultValue, onConfirm, onClose }: {
  title: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
    inputRef.current?.select()
  }, [])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl w-[320px] modal-enter" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/5"><div className="text-xs font-semibold">{title}</div></div>
        <form onSubmit={e => { e.preventDefault(); if (value.trim()) onConfirm(value.trim()) }}>
          <div className="px-4 py-3">
            <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
              className="w-full bg-[#181825] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50" />
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/5">
            <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg text-xs text-[#585b70] hover:bg-white/5">Cancel</button>
            <button type="submit" className="px-3 py-1 rounded-lg text-xs font-medium bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20">OK</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SftpEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  isFile: boolean
  mode?: number
  modifiedAt?: string | null
}

function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number
  items: { label: string; icon?: any; color?: string; onClick: () => void }[]
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed z-[61] bg-[#1e1e2e] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[160px] slide-up"
        style={{ left: x, top: y }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => { item.onClick(); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-white/5"
            style={{ color: item.color || '#cdd6f4' }}>
            {item.icon && <item.icon size={12} />}
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

interface SftpPanelProps {
  sessionId: string | null
  visible: boolean
  onToggle: () => void
  embedded?: boolean
}

import SyntaxHighlighter from './SyntaxHighlighter'
import DeployDialog from './DeployDialog'

function FileViewer({ path, content, isRemote, onSave, onClose }: {
  path: string
  content: string
  isRemote: boolean
  onSave: (newContent: string) => Promise<void>
  onClose: () => void
}) {
  const [isEditing, setIsEditing] = useState(true) // Default to edit mode
  const [editedContent, setEditedContent] = useState(content)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const ext = (path.split('.').pop() || '').toLowerCase()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(-1)
  const [searchResults, setSearchResults] = useState<number[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  const handleSave = async (contentToSave: string) => {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      await onSave(contentToSave)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err: any) {
      setSaveError(err.message || 'Lỗi khi lưu file')
    }
    setSaving(false)
  }

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const selectSearchMatch = (startIdx: number, length: number) => {
    if (textareaRef.current) {
      textareaRef.current.focus()
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(startIdx, startIdx + length)
          const lineIndex = valToLineIndex(textareaRef.current.value, startIdx)
          const lineHeight = 16.25 // leading-relaxed
          textareaRef.current.scrollTop = lineIndex * lineHeight - 50
        }
      }, 10)
    }
  }

  const valToLineIndex = (val: string, index: number): number => {
    return val.substring(0, index).split('\n').length - 1
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query) {
      setSearchResults([])
      setSearchIndex(-1)
      return
    }

    const indexes: number[] = []
    let idx = editedContent.toLowerCase().indexOf(query.toLowerCase())
    while (idx !== -1) {
      indexes.push(idx)
      idx = editedContent.toLowerCase().indexOf(query.toLowerCase(), idx + 1)
    }
    setSearchResults(indexes)
    if (indexes.length > 0) {
      setSearchIndex(0)
      selectSearchMatch(indexes[0], query.length)
    } else {
      setSearchIndex(-1)
    }
  }

  const handleFindNext = () => {
    if (searchResults.length === 0) return
    const nextIdx = (searchIndex + 1) % searchResults.length
    setSearchIndex(nextIdx)
    selectSearchMatch(searchResults[nextIdx], searchQuery.length)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSave(editedContent)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const val = textarea.value

      const tabString = '  '
      const newValue = val.substring(0, start) + tabString + val.substring(end)
      setEditedContent(newValue)

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tabString.length
      }, 0)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 dialog-overlay" onClick={onClose}>
      <div className="bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl w-[90vw] h-[85vh] flex flex-col modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#a6adc8] truncate">
            <File size={14} className="text-[#89b4fa]" />
            <span className="font-mono truncate">{path} <span className="text-[10px] text-[#585b70]">({isRemote ? 'Remote' : 'Local'})</span></span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saveSuccess && <span className="text-[10px] text-[#a6e3a1] font-semibold animate-pulse mr-2">Đã lưu!</span>}
            {saveError && <span className="text-[10px] text-[#f38ba8] mr-2">{saveError}</span>}

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-2.5 py-1 rounded bg-white/5 text-[#a6adc8] hover:bg-white/10 text-[10px] font-bold transition-all"
            >
              {isEditing ? 'Xem dạng Code' : 'Chỉnh sửa trực tiếp'}
            </button>

            {isEditing && (
              <button
                onClick={() => handleSave(editedContent)}
                className="px-2.5 py-1 rounded bg-[#a6e3a1]/10 text-[#a6e3a1] hover:bg-[#a6e3a1]/20 text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95"
                disabled={saving}
              >
                {saving && <Loader2 size={10} className="animate-spin" />}
                Lưu (Ctrl+S)
              </button>
            )}

            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" disabled={saving}><X size={14} /></button>
          </div>
        </div>

        {isEditing && (
          <div className="px-4 py-1.5 border-b border-white/5 bg-[#181825]/40 flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Tìm kiếm từ khóa..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1 text-xs text-[#cdd6f4] outline-none w-48 focus:border-[#89b4fa]/20"
            />
            {searchResults.length > 0 && (
              <span className="text-[10px] text-[#585b70] font-mono">
                {searchIndex + 1} / {searchResults.length}
              </span>
            )}
            {searchResults.length > 0 && (
              <button
                type="button"
                onClick={handleFindNext}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-[#cdd6f4] font-medium"
              >
                Tiếp theo
              </button>
            )}
            {searchQuery && searchResults.length === 0 && (
              <span className="text-[10px] text-[#f38ba8]">Không tìm thấy từ khóa</span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden flex bg-[#11111b]/40">
          {isEditing ? (
            <div className="flex-1 flex overflow-hidden">
              <div
                ref={lineNumbersRef}
                className="w-12 text-right pr-2 py-4 select-none border-r border-white/5 text-[#585b70] font-mono text-[11px] overflow-hidden leading-relaxed bg-[#181825]"
              >
                {editedContent.split('\n').map((_, idx) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>
              
              <textarea
                ref={textareaRef}
                value={editedContent}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                onChange={(e) => setEditedContent(e.target.value)}
                wrap="off"
                className="flex-1 h-full bg-transparent text-[#cdd6f4] font-mono p-4 pl-3 outline-none resize-none text-[11px] leading-relaxed overflow-auto scrollbar-thin select-text whitespace-pre"
                disabled={saving}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <SyntaxHighlighter code={editedContent} language={ext} />
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-white/5 text-[9px] text-[#45475a] flex items-center gap-3 shrink-0">
          <span>{(editedContent.length / 1024).toFixed(1)} KB</span>
          <span>{editedContent.split('\n').length} dòng</span>
        </div>
      </div>
    </div>
  )
}

export default function SftpPanel({ sessionId, visible, onToggle, embedded = false }: SftpPanelProps) {
  // Remote state
  const [cwd, setCwd] = useState(() => {
    if (sessionId) {
      return localStorage.getItem(`sftp_remote_cwd_${sessionId}`) || '/'
    }
    return '/'
  })
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>(() => {
    if (sessionId) {
      const saved = localStorage.getItem(`sftp_remote_cwd_${sessionId}`)
      return saved ? [saved] : ['/']
    }
    return ['/']
  })
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Local state
  const [drives, setDrives] = useState<any[]>([])
  const [localCwd, setLocalCwd] = useState(() => {
    if (sessionId) {
      return localStorage.getItem(`sftp_local_cwd_${sessionId}`) || ''
    }
    return ''
  })
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localHistory, setLocalHistory] = useState<string[]>(() => {
    if (sessionId) {
      const saved = localStorage.getItem(`sftp_local_cwd_${sessionId}`)
      return saved ? [saved] : []
    }
    return []
  })
  const [localSearchQuery, setLocalSearchQuery] = useState('')

  // Selected files tracking
  const [selectedLocal, setSelectedLocal] = useState<string[]>([])
  const [selectedRemote, setSelectedRemote] = useState<string[]>([])
  const [lastSelectedLocal, setLastSelectedLocal] = useState<string | null>(null)
  const [lastSelectedRemote, setLastSelectedRemote] = useState<string | null>(null)

  const handleSelectLocal = (e: React.MouseEvent, entry: LocalEntry, index: number) => {
    e.stopPropagation()
    const path = entry.path

    if (e.ctrlKey || e.metaKey) {
      setSelectedLocal(prev =>
        prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      )
      setLastSelectedLocal(path)
    } else if (e.shiftKey && lastSelectedLocal) {
      const lastIndex = filteredLocalEntries.findIndex(item => item.path === lastSelectedLocal)
      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, index)
        const end = Math.max(lastIndex, index)
        const pathsInRange = filteredLocalEntries.slice(start, end + 1).map(item => item.path)
        setSelectedLocal(prev => Array.from(new Set([...prev, ...pathsInRange])))
      }
    } else {
      setSelectedLocal([path])
      setLastSelectedLocal(path)
    }
  }

  const handleSelectRemote = (e: React.MouseEvent, entry: SftpEntry, index: number) => {
    e.stopPropagation()
    const path = entry.path

    if (e.ctrlKey || e.metaKey) {
      setSelectedRemote(prev =>
        prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      )
      setLastSelectedRemote(path)
    } else if (e.shiftKey && lastSelectedRemote) {
      const lastIndex = filteredRemoteEntries.findIndex(item => item.path === lastSelectedRemote)
      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, index)
        const end = Math.max(lastIndex, index)
        const pathsInRange = filteredRemoteEntries.slice(start, end + 1).map(item => item.path)
        setSelectedRemote(prev => Array.from(new Set([...prev, ...pathsInRange])))
      }
    } else {
      setSelectedRemote([path])
      setLastSelectedRemote(path)
    }
  }

  // Transfers queue
  const [transfers, setTransfers] = useState<Array<{
    id: string
    name: string
    type: 'upload' | 'download'
    status: 'active' | 'success' | 'error'
    progress: number
    errorMsg?: string
    speed?: string
    detail?: string
  }>>([])
  const [showQueue, setShowQueue] = useState(false)

  // Bookmarks state
  const [localBookmarks, setLocalBookmarks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`sftp_local_bookmarks_${sessionId}`) || '[]')
    } catch { return [] }
  })
  const [remoteBookmarks, setRemoteBookmarks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`sftp_remote_bookmarks_${sessionId}`) || '[]')
    } catch { return [] }
  })
  const [showLocalBookmarks, setShowLocalBookmarks] = useState(false)
  const [showRemoteBookmarks, setShowRemoteBookmarks] = useState(false)

  // Auto-Sync state
  const [autoSyncActive, setAutoSyncActive] = useState(false)

  // Show/Hide columns options
  const [showPermissions, setShowPermissions] = useState(() => {
    return localStorage.getItem('sftp_show_permissions') !== 'false'
  })
  const [showTime, setShowTime] = useState(() => {
    return localStorage.getItem('sftp_show_time') !== 'false'
  })

  // Compare mode state
  const [compareActive, setCompareActive] = useState(false)

  // Recursive search state
  const [recursiveSearch, setRecursiveSearch] = useState(false)

  // Folder sizes map state (remote path -> bytes size)
  const [folderSizes, setFolderSizes] = useState<Record<string, number>>({})

  // Common popups
  const [viewFile, setViewFile] = useState<{ path: string; content: string; isRemote: boolean } | null>(null)
  const [showDeployDlg, setShowDeployDlg] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: any; isRemote: boolean } | null>(null)
  const [inputDlg, setInputDlg] = useState<{ title: string; defaultValue?: string; onConfirm: (v: string) => void } | null>(null)

  // Fetch drives and initial local path
  useEffect(() => {
    const initLocal = async () => {
      try {
        const drvs = await window.api.local.getDrives()
        setDrives(drvs)
        
        // Restore local path if not saved yet
        if (sessionId) {
          const savedLocal = localStorage.getItem(`sftp_local_cwd_${sessionId}`)
          if (!savedLocal && drvs.length > 0) {
            setLocalCwd(drvs[0].path)
            setLocalHistory([drvs[0].path])
          }
        } else if (drvs.length > 0 && !localCwd) {
          setLocalCwd(drvs[0].path)
          setLocalHistory([drvs[0].path])
        }
      } catch {}
    }
    if (visible) initLocal()
  }, [visible, sessionId])

  // Monitor sessionId change to reload paths from storage
  useEffect(() => {
    if (sessionId) {
      const savedLocal = localStorage.getItem(`sftp_local_cwd_${sessionId}`)
      const savedRemote = localStorage.getItem(`sftp_remote_cwd_${sessionId}`)
      if (savedLocal) {
        setLocalCwd(savedLocal)
        setLocalHistory([savedLocal])
      }
      if (savedRemote) {
        setCwd(savedRemote)
        setHistory([savedRemote])
      }
    }
  }, [sessionId])

  // Save paths to localStorage when they change
  useEffect(() => {
    if (sessionId && localCwd) {
      localStorage.setItem(`sftp_local_cwd_${sessionId}`, localCwd)
    }
  }, [localCwd, sessionId])

  useEffect(() => {
    if (sessionId && cwd) {
      localStorage.setItem(`sftp_remote_cwd_${sessionId}`, cwd)
    }
  }, [cwd, sessionId])

  // Register real-time progress listener
  useEffect(() => {
    const unsub = window.api.sftp.onProgress((data) => {
      setTransfers(prev =>
        prev.map(t =>
          t.id === data.taskId
            ? { ...t, progress: data.progress, speed: data.speed, detail: data.detail }
            : t
        )
      )
    })
    return () => unsub()
  }, [])

  // Auto-Sync File Changed Listener
  useEffect(() => {
    const unsub = window.api.local.onFileChanged((data) => {
      if (autoSyncActive && data.watchId === `sync_${sessionId}`) {
        // Tự động upload file thay đổi lên Remote tương ứng
        handleUploadLocalToRemote([data.localPath])
      }
    })
    return () => {
      unsub()
    }
  }, [autoSyncActive, sessionId, localCwd, cwd])

  // Toggle Auto Sync watch
  useEffect(() => {
    const watchId = `sync_${sessionId}`
    if (autoSyncActive && sessionId && localCwd) {
      window.api.local.watchDir(localCwd, watchId)
    }
    return () => {
      if (sessionId) {
        window.api.local.unwatchDir(watchId)
      }
    }
  }, [autoSyncActive, sessionId, localCwd])

  // Load bookmarks on sessionId change
  useEffect(() => {
    if (sessionId) {
      try {
        setLocalBookmarks(JSON.parse(localStorage.getItem(`sftp_local_bookmarks_${sessionId}`) || '[]'))
        setRemoteBookmarks(JSON.parse(localStorage.getItem(`sftp_remote_bookmarks_${sessionId}`) || '[]'))
      } catch {}
    }
  }, [sessionId])

  // Load Remote Dir
  const loadDir = useCallback(async (dir: string, forceRecursive: boolean = false) => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    
    let result;
    if (forceRecursive || (recursiveSearch && searchQuery)) {
      result = await window.api.sftp.listDirRecursive(sessionId, dir)
    } else {
      result = await window.api.sftp.listDir(sessionId, dir)
    }

    if (result.error) {
      setError(result.error)
      setEntries([])
    } else {
      setEntries(result)
    }
    setLoading(false)
  }, [sessionId, recursiveSearch, searchQuery])

  // Load Local Dir
  const loadLocalDir = useCallback(async (dir: string) => {
    setLocalLoading(true)
    try {
      const items = await window.api.local.listDir(dir)
      setLocalEntries(items)
    } catch {}
    setLocalLoading(false)
  }, [])

  useEffect(() => {
    if (visible && sessionId) loadDir(cwd)
  }, [visible, sessionId, cwd, loadDir])

  useEffect(() => {
    if (visible && localCwd) loadLocalDir(localCwd)
  }, [visible, localCwd, loadLocalDir])

  // Navigation handlers
  const enterDir = (dirPath: string) => { setHistory([...history, dirPath]); setCwd(dirPath) }
  const goBack = () => {
    if (history.length > 1) {
      const h = history.slice(0, -1)
      setHistory(h)
      setCwd(h[h.length - 1])
    }
  }
  const goHome = () => { setHistory(['/']); setCwd('/') }

  const enterLocalDir = (dirPath: string) => {
    setLocalHistory([...localHistory, dirPath])
    setLocalCwd(dirPath)
  }
  const goLocalBack = () => {
    // Chỉ lùi lại nếu ngăn xếp lịch sử lớn hơn 1
    if (localHistory.length > 1) {
      const h = localHistory.slice(0, -1)
      setLocalHistory(h)
      setLocalCwd(h[h.length - 1])
    } else {
      // Nếu hết lịch sử, cố gắng lùi lên thư mục cha của đường dẫn hiện tại thay vì nhảy về ổ đĩa gốc
      const sep = localCwd.includes('/') ? '/' : '\\'
      const parts = localCwd.split(sep).filter(Boolean)
      if (parts.length > 1) {
        parts.pop()
        const parentPath = parts.join(sep) + (localCwd.endsWith(sep) || localCwd.startsWith('/') ? '' : '')
        // Đảm bảo Windows drive root vẫn giữ dấu gạch chéo
        const formattedPath = parentPath.match(/^[A-Z]:$/i) ? parentPath + '\\' : parentPath
        setLocalCwd(formattedPath)
        setLocalHistory([formattedPath])
      }
    }
  }

  // Bookmarks handlers
  const handleAddLocalBookmark = (path: string) => {
    if (!path || localBookmarks.includes(path)) return
    const updated = [...localBookmarks, path]
    setLocalBookmarks(updated)
    localStorage.setItem(`sftp_local_bookmarks_${sessionId}`, JSON.stringify(updated))
  }

  const handleRemoveLocalBookmark = (path: string) => {
    const updated = localBookmarks.filter(p => p !== path)
    setLocalBookmarks(updated)
    localStorage.setItem(`sftp_local_bookmarks_${sessionId}`, JSON.stringify(updated))
  }

  const handleAddRemoteBookmark = (path: string) => {
    if (!path || remoteBookmarks.includes(path)) return
    const updated = [...remoteBookmarks, path]
    setRemoteBookmarks(updated)
    localStorage.setItem(`sftp_remote_bookmarks_${sessionId}`, JSON.stringify(updated))
  }

  const handleRemoveRemoteBookmark = (path: string) => {
    const updated = remoteBookmarks.filter(p => p !== path)
    setRemoteBookmarks(updated)
    localStorage.setItem(`sftp_remote_bookmarks_${sessionId}`, JSON.stringify(updated))
  }

  // Clear selection on navigation
  useEffect(() => {
    setSelectedRemote([])
    setLastSelectedRemote(null)
  }, [cwd])

  useEffect(() => {
    setSelectedLocal([])
    setLastSelectedLocal(null)
  }, [localCwd])

  // Size formatter
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Format mode permissions to octal string (e.g. 755 or 644)
  const formatMode = (mode?: number) => {
    if (mode === undefined) return ''
    const octal = (mode & 0o777).toString(8)
    return '0' + octal.padStart(3, '0')
  }

  // Format date-time
  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return ''
    try {
      const d = new Date(timeStr)
      return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Open Remote path in active SSH Terminal
  const handleOpenTerminal = () => {
    if (!sessionId) return
    // Gửi phím Enter kèm lệnh cd để chuyển đổi thư mục trực tiếp trên terminal SSH
    window.api.ssh.shellInput(sessionId, `clear\ncd "${cwd}"\npwd\n`)
    // Alert user that shell commands were sent to active Terminal
    alert(`Đã gửi lệnh cd đến tab Terminal hoạt động: cd "${cwd}"`)
  }

  // Calculate folder size using du -sb command
  const handleCalculateFolderSize = async (dirPath: string) => {
    if (!sessionId) return
    try {
      const escapedPath = dirPath.replace(/"/g, '\\"')
      const res = await window.api.ssh.exec(sessionId, `du -sb "${escapedPath}"`)
      if (res.code === 0 && res.stdout) {
        const sizeBytes = parseInt(res.stdout.trim().split(/\s+/)[0])
        if (!isNaN(sizeBytes)) {
          setFolderSizes(prev => ({ ...prev, [dirPath]: sizeBytes }))
        }
      } else {
        // Fallback if du is not available
        alert('Không thể tính dung lượng: Server không hỗ trợ lệnh du hoặc thư mục trống.')
      }
    } catch (err: any) {
      alert(`Lỗi khi tính dung lượng: ${err.message}`)
    }
  }

  // Queue tracking helpers
  const addTransfer = (name: string, type: 'upload' | 'download', id: string) => {
    setTransfers(prev => [{ id, name, type, status: 'active', progress: 30 }, ...prev])
    setShowQueue(true)
  }
  const updateTransfer = (id: string, updates: Partial<(typeof transfers)[0]>) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  // Action: Cancel Transfer Task
  const handleCancelTransfer = async (id: string) => {
    try {
      await window.api.sftp.cancelTask(id)
      updateTransfer(id, { status: 'error', errorMsg: 'Đang hủy...' })
    } catch {}
  }

  // Action: Upload (Local -> Remote)
  const handleUploadLocalToRemote = async (paths: string[]) => {
    if (!sessionId || paths.length === 0) return
    const label = paths.length === 1
      ? paths[0].substring(paths[0].lastIndexOf('\\') + 1).substring(paths[0].lastIndexOf('/') + 1)
      : `${paths.length} tệp`
    const transferId = Math.random().toString(36).substring(7)
    addTransfer(label, 'upload', transferId)
    try {
      updateTransfer(transferId, { progress: 60 })
      const result = await window.api.sftp.deploy(sessionId, localCwd, cwd, paths, transferId)
      if (result.canceled) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: 'Đã hủy bỏ' })
      } else if (result.errors && result.errors.length > 0) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: result.errors[0] })
      } else {
        updateTransfer(transferId, { status: 'success', progress: 100 })
        loadDir(cwd)
      }
    } catch (err: any) {
      updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: err.message })
    }
  }

  // Action: Download (Remote -> Local)
  const handleDownloadRemoteToLocal = async (paths: string[]) => {
    if (!sessionId || paths.length === 0) return
    const label = paths.length === 1
      ? paths[0].substring(paths[0].lastIndexOf('/') + 1)
      : `${paths.length} tệp`
    const transferId = Math.random().toString(36).substring(7)
    addTransfer(label, 'download', transferId)
    try {
      updateTransfer(transferId, { progress: 60 })
      const result = await window.api.sftp.downloadFiles(sessionId, paths, localCwd, transferId)
      if (result.canceled) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: 'Đã hủy bỏ' })
      } else if (result.errors && result.errors.length > 0) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: result.errors[0] })
      } else {
        updateTransfer(transferId, { status: 'success', progress: 100 })
        loadLocalDir(localCwd)
      }
    } catch (err: any) {
      updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: err.message })
    }
  }

  // Generic File Opener / Reader
  const handleOpenRemoteFile = async (path: string) => {
    if (!sessionId) return
    try {
      const result = await window.api.sftp.readFile(sessionId, path)
      if (result.error) alert('Lỗi đọc file: ' + result.error)
      else if (!result.isText) alert('Không thể chỉnh sửa file Binary trực tiếp!')
      else setViewFile({ path, content: result.content || '', isRemote: true })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleOpenLocalFile = async (path: string) => {
    try {
      const result = await window.api.sftp.readFile(sessionId || '', path)
      if (result.error) {
        const content = await window.api.history.readLog(path)
        setViewFile({ path, content, isRemote: false })
      } else {
        setViewFile({ path, content: result.content || '', isRemote: false })
      }
    } catch (err: any) {
      alert('Không thể mở tệp cục bộ!')
    }
  }

  // Save changes inside editor
  const handleSaveFileContent = async (newContent: string) => {
    if (!viewFile) return
    if (viewFile.isRemote) {
      if (!sessionId) return
      const result = await window.api.sftp.writeFile(sessionId, viewFile.path, newContent)
      if (result.error) throw new Error(result.error)
      loadDir(cwd)
    } else {
      const result = await window.api.local.writeFile(viewFile.path, newContent)
      if (result.error) throw new Error(result.error)
      loadLocalDir(localCwd)
    }
  }

  // Remote folder operations
  const handleMkdirRemote = () => {
    if (!sessionId) return
    setInputDlg({
      title: 'Tạo thư mục mới (Remote)',
      defaultValue: '',
      onConfirm: async (name) => {
        setInputDlg(null)
        if (!name) return
        const newPath = cwd + (cwd.endsWith('/') ? '' : '/') + name
        const result = await window.api.sftp.mkdir(sessionId, newPath)
        if (!result.error) loadDir(cwd)
      }
    })
  }

  // Local folder operations
  const handleMkdirLocal = () => {
    setInputDlg({
      title: 'Tạo thư mục mới (Local)',
      defaultValue: '',
      onConfirm: async (name) => {
        setInputDlg(null)
        if (!name) return
        const sep = localCwd.endsWith('\\') || localCwd.endsWith('/') ? '' : '/'
        const newPath = localCwd + sep + name
        const result = await window.api.local.mkdir(newPath)
        if (!result.error) loadLocalDir(localCwd)
      }
    })
  }

  // Remote delete
  const handleDeleteRemoteMultiple = async (targetEntries: SftpEntry[]) => {
    if (!sessionId || targetEntries.length === 0) return
    const msg = targetEntries.length === 1 
      ? `Bạn có chắc chắn muốn xóa ${targetEntries[0].name}?`
      : `Bạn có chắc chắn muốn xóa ${targetEntries.length} mục đã chọn trên Server?`
    if (confirm(msg)) {
      for (const entry of targetEntries) {
        if (entry.isDirectory) await window.api.sftp.deleteDir(sessionId, entry.path)
        else await window.api.sftp.deleteFile(sessionId, entry.path)
      }
      loadDir(cwd)
      setSelectedRemote([])
    }
  }

  // Local delete
  const handleDeleteLocalMultiple = async (targetEntries: LocalEntry[]) => {
    if (targetEntries.length === 0) return
    const msg = targetEntries.length === 1 
      ? `Bạn có chắc chắn muốn xóa ${targetEntries[0].name}?`
      : `Bạn có chắc chắn muốn xóa ${targetEntries.length} mục đã chọn?`
    if (confirm(msg)) {
      for (const entry of targetEntries) {
        await window.api.local.delete(entry.path)
      }
      loadLocalDir(localCwd)
      setSelectedLocal([])
    }
  }

  // Filter lists
  const filteredLocalEntries = useMemo(() => {
    if (!localSearchQuery) return localEntries
    const q = localSearchQuery.toLowerCase()
    return localEntries.filter(e => e.name.toLowerCase().includes(q))
  }, [localEntries, localSearchQuery])

  const filteredRemoteEntries = useMemo(() => {
    if (!searchQuery) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery])

  if (!visible) return null

  return (
    <>
      <div className={`${embedded ? 'flex-1' : 'w-[780px] min-w-[780px]'} bg-[#181825]/96 backdrop-blur-md border-r border-white/5 flex flex-col relative shrink-0`}>
        {/* Main Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#11111b]/50">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
            <span className="text-xs font-bold text-[#cdd6f4] tracking-wider flex items-center gap-1.5">
              SFTP File Manager <ArrowLeftRight size={12} className="text-[#585b70]" /> Dual Panel
            </span>
          </div>
          {!embedded && (
            <button onClick={onToggle} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all"><X size={14} /></button>
          )}
        </div>

        {/* Panes Container */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT PANEL: LOCAL FILES */}
          <div className="flex-1 flex flex-col border-r border-white/5 bg-[#11111b]/20">
            {/* Header / Select drive */}
            <div className="px-3 py-2 border-b border-white/5 bg-[#181825] flex justify-between items-center">
              <span className="text-[10px] font-bold text-[#89b4fa] uppercase tracking-wider">Local Computer</span>
              {drives.length > 1 && (
                <select
                  value={drives.find(d => localCwd.startsWith(d.path))?.path || drives[0]?.path}
                  onChange={(e) => { setLocalCwd(e.target.value); loadLocalDir(e.target.value) }}
                  className="bg-[#11111b] text-[#a6adc8] border border-white/5 rounded-lg px-2 py-0.5 text-[9px] font-semibold outline-none"
                >
                  {drives.map(d => (
                    <option key={d.path} value={d.path}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 bg-[#1e1e2e]/50">
              <button onClick={() => { if (drives.length > 0) setLocalCwd(drives[0].path) }} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Drives"><HardDrive size={12} /></button>
              <button onClick={goLocalBack} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Lùi lại"><ChevronRight size={12} className="rotate-180" /></button>
              <button onClick={() => loadLocalDir(localCwd)} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tải lại"><RefreshCw size={12} /></button>
              <div className="flex-1" />
              
              {/* Auto Sync Toggle Button */}
              <button
                onClick={() => setAutoSyncActive(!autoSyncActive)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                  autoSyncActive 
                    ? 'bg-[#a6e3a1]/10 text-[#a6e3a1] animate-pulse border border-[#a6e3a1]/20' 
                    : 'bg-white/5 text-[#585b70] hover:text-[#cdd6f4]'
                }`}
                title="Bật/Tắt chế độ Auto-Sync (Tự động theo dõi & upload thư mục local hiện tại)"
              >
                {autoSyncActive ? '● Auto Sync' : 'Auto Sync'}
              </button>

              <button
                onClick={async () => {
                  const dir = await window.api.local.selectDir()
                  if (dir) {
                    handleUploadLocalToRemote([dir])
                  }
                }}
                className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]"
                title="Chọn thư mục & Đẩy lên Server (ví dụ: dist)"
              >
                <Upload size={12} />
              </button>
              <button onClick={handleMkdirLocal} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tạo thư mục mới"><FolderPlus size={12} /></button>
            </div>

            {/* Local Search */}
            <div className="px-2 py-1.5 border-b border-white/5 bg-[#11111b]/20 flex items-center gap-1.5">
              <Search size={11} className="text-[#585b70]" />
              <input
                type="text"
                placeholder="Lọc file cục bộ..."
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[10px] text-[#cdd6f4] outline-none placeholder-[#45475a]"
              />
              {localSearchQuery && <button onClick={() => setLocalSearchQuery('')} className="text-[#585b70] hover:text-[#cdd6f4]"><X size={10} /></button>}
            </div>

            {/* Path Input (Local) */}
            <div className="px-2 py-1.5 bg-[#11111b]/40 border-b border-white/5 flex items-center gap-1 relative">
              <input
                type="text"
                value={localCwd}
                onChange={(e) => setLocalCwd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadLocalDir(localCwd)
                  }
                }}
                className="flex-1 bg-transparent text-[10px] font-mono text-[#a6adc8] outline-none border border-transparent focus:border-[#89b4fa]/20 rounded px-1.5 py-0.5"
                title="Đường dẫn cục bộ (Nhập và nhấn Enter để truy cập)"
              />
              
              {/* Add Bookmark star */}
              <button
                onClick={() => handleAddLocalBookmark(localCwd)}
                className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#f9e2af]"
                title="Ghim thư mục này vào Bookmarks"
              >
                <Star size={11} className={localBookmarks.includes(localCwd) ? 'fill-[#f9e2af] text-[#f9e2af]' : ''} />
              </button>

              {/* Show Bookmarks Dropdown toggle */}
              <button
                onClick={() => setShowLocalBookmarks(!showLocalBookmarks)}
                className="px-1 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[8px] text-[#a6adc8]"
                title="Xem danh sách Bookmarks đã ghim"
              >
                Ghim
              </button>

              {showLocalBookmarks && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLocalBookmarks(false)} />
                  <div className="absolute right-2 top-8 z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[200px] max-w-[320px] max-h-[200px] overflow-y-auto scrollbar-thin">
                    <div className="px-2.5 py-1 text-[8px] font-bold text-[#585b70] border-b border-white/5 uppercase">Bookmarks đã ghim (Local)</div>
                    {localBookmarks.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-[9px] text-[#585b70] italic">Trống</div>
                    ) : (
                      localBookmarks.map((b) => (
                        <div key={b} className="w-full flex items-center justify-between gap-2 px-2 py-1 hover:bg-white/5 text-[10px] text-[#cdd6f4]">
                          <button onClick={() => { setLocalCwd(b); loadLocalDir(b); setShowLocalBookmarks(false) }} className="flex-1 text-left truncate font-mono text-[9px]">
                            {b}
                          </button>
                          <button onClick={() => handleRemoveLocalBookmark(b)} className="text-[#f38ba8] hover:text-[#f38ba8]/80 text-[8px] px-1">Xóa</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              <button
                onClick={async () => {
                  const dir = await window.api.local.selectDir()
                  if (dir) {
                    setLocalCwd(dir)
                    loadLocalDir(dir)
                  }
                }}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-[#cdd6f4]"
                title="Browse thư mục cục bộ nhanh"
              >
                Browse
              </button>
            </div>

            {/* Local List */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                // Drop from Remote to Local -> download files
                const rawData = e.dataTransfer.getData('text/plain')
                if (rawData && rawData.startsWith('remote:')) {
                  const paths = rawData.replace('remote:', '').split('\n')
                  handleDownloadRemoteToLocal(paths)
                }
              }}
              className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin"
            >
              {localLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={14} className="animate-spin text-[#585b70]" /></div>
              ) : filteredLocalEntries.length === 0 ? (
                <div className="text-[10px] text-[#45475a] text-center py-8">Thư mục trống</div>
              ) : (
                filteredLocalEntries.map((entry, index) => (
                  <div
                    key={entry.path}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `local:${entry.path}`)
                    }}
                    onClick={(e) => handleSelectLocal(e, entry, index)}
                    onDoubleClick={() => {
                      if (entry.isDirectory) enterLocalDir(entry.path)
                      else handleOpenLocalFile(entry.path)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setSelectedLocal(prev => prev.includes(entry.path) ? prev : [entry.path])
                      setCtxMenu({ x: e.clientX, y: e.clientY, entry, isRemote: false })
                    }}
                    className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all pr-[80px] ${
                      selectedLocal.includes(entry.path)
                        ? 'bg-[#89b4fa]/15 text-[#89b4fa]'
                        : compareActive
                          ? (() => {
                              const match = entries.find(r => r.name === entry.name)
                              if (!match) return 'hover:bg-white/[0.02] text-[#a6e3a1]' // Chỉ có ở Local
                              if (match.size !== entry.size) return 'hover:bg-white/[0.02] text-[#fab387]' // Khác kích thước
                              return 'hover:bg-white/[0.02] text-[#585b70]' // Khớp hoàn toàn
                            })()
                          : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {entry.isDirectory ? <Folder size={13} className="text-[#f9e2af] shrink-0" /> : <File size={13} className="text-[#89b4fa] shrink-0" />}
                    <span className="text-[11px] truncate flex-1 leading-none">{entry.name}</span>
                    {entry.isFile && <span className="text-[9px] font-mono shrink-0 mr-1 opacity-70">{formatSize(entry.size)}</span>}
                    <div className="hidden group-hover:flex gap-1 absolute right-2 top-1/2 -translate-y-1/2 bg-[#1e1e2e]/90 px-1 py-0.5 rounded shadow border border-white/5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUploadLocalToRemote([entry.path]) }}
                        className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]"
                        title={entry.isDirectory ? "Tải thư mục lên Server" : "Tải file lên Server"}
                      >
                        <FileUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteLocalMultiple([entry]) }}
                        className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#f38ba8]"
                        title="Xóa"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT PANEL: REMOTE FILES */}
          <div className="flex-1 flex flex-col bg-[#11111b]/10">
            {/* Header */}
            <div className="px-3 py-2 border-b border-white/5 bg-[#181825] flex justify-between items-center">
              <span className="text-[10px] font-bold text-[#f9e2af] uppercase tracking-wider">Remote Server</span>
              <span className="text-[9px] font-mono text-[#585b70]">SFTP connection active</span>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/5 bg-[#1e1e2e]/50">
              <button onClick={goHome} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Gốc (Home)"><Home size={12} /></button>
              <button onClick={goBack} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Lùi lại"><ChevronRight size={12} className="rotate-180" /></button>
              <button onClick={() => loadDir(cwd)} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tải lại"><RefreshCw size={12} /></button>
              
              <div className="flex-1" />

              {/* Compare toggle button */}
              <button
                onClick={() => setCompareActive(!compareActive)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                  compareActive 
                    ? 'bg-[#fab387]/20 text-[#fab387] border border-[#fab387]/30' 
                    : 'bg-white/5 text-[#585b70] hover:text-[#cdd6f4]'
                }`}
                title="So sánh thư mục (Highlight tệp tin lệch/thiếu giữa Local và Remote)"
              >
                Compare
              </button>

              {/* Terminal cd helper button */}
              <button
                onClick={handleOpenTerminal}
                className="px-1.5 py-0.5 rounded bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 text-[8px] font-bold uppercase"
                title="Mở Terminal và cd vào thư mục remote này"
              >
                Mở Terminal
              </button>

              {/* Show/Hide column toggles */}
              <label className="flex items-center gap-1 text-[8px] text-[#585b70] cursor-pointer hover:text-[#cdd6f4]">
                <input
                  type="checkbox"
                  checked={showTime}
                  onChange={(e) => {
                    setShowTime(e.target.checked)
                    localStorage.setItem('sftp_show_time', String(e.target.checked))
                  }}
                  className="rounded bg-[#11111b] border-white/10 text-[#89b4fa] focus:ring-0 w-2.5 h-2.5"
                />
                <span>Thời gian</span>
              </label>

              <label className="flex items-center gap-1 text-[8px] text-[#585b70] cursor-pointer hover:text-[#cdd6f4]">
                <input
                  type="checkbox"
                  checked={showPermissions}
                  onChange={(e) => {
                    setShowPermissions(e.target.checked)
                    localStorage.setItem('sftp_show_permissions', String(e.target.checked))
                  }}
                  className="rounded bg-[#11111b] border-white/10 text-[#89b4fa] focus:ring-0 w-2.5 h-2.5"
                />
                <span>Quyền</span>
              </label>

              <button onClick={handleMkdirRemote} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tạo thư mục mới"><FolderPlus size={12} /></button>
              <button onClick={() => setShowDeployDlg(true)} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]" title="Upload thư mục nâng cao"><Upload size={12} /></button>
            </div>

            {/* Remote Search */}
            <div className="px-2 py-1.5 border-b border-white/5 bg-[#11111b]/20 flex items-center gap-1.5">
              <Search size={11} className="text-[#585b70]" />
              <input
                type="text"
                placeholder={recursiveSearch ? "Tìm đệ quy trong thư mục con..." : "Lọc file remote..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[10px] text-[#cdd6f4] outline-none placeholder-[#45475a]"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[#585b70] hover:text-[#cdd6f4] mr-1.5"><X size={10} /></button>}
              
              {/* Recursive search toggle checkbox */}
              <label className="flex items-center gap-1 text-[8px] text-[#585b70] cursor-pointer hover:text-[#cdd6f4] shrink-0 border-l border-white/5 pl-1.5">
                <input
                  type="checkbox"
                  checked={recursiveSearch}
                  onChange={(e) => {
                    setRecursiveSearch(e.target.checked)
                    if (e.target.checked && searchQuery) {
                      loadDir(cwd, true)
                    }
                  }}
                  className="rounded bg-[#11111b] border-white/10 text-[#f9e2af] focus:ring-0 w-2.5 h-2.5"
                />
                <span>Đệ quy</span>
              </label>
            </div>

            {/* Path Input (Remote) */}
            <div className="px-2 py-1.5 bg-[#11111b]/40 border-b border-white/5 flex items-center gap-1 relative">
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadDir(cwd)
                  }
                }}
                className="flex-1 bg-transparent text-[10px] font-mono text-[#fab387] outline-none border border-transparent focus:border-[#fab387]/20 rounded px-1.5 py-0.5"
                title="Đường dẫn Remote (Nhập và nhấn Enter để truy cập)"
              />

              {/* Add Remote Bookmark star */}
              <button
                onClick={() => handleAddRemoteBookmark(cwd)}
                className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#f9e2af]"
                title="Ghim thư mục remote này vào Bookmarks"
              >
                <Star size={11} className={remoteBookmarks.includes(cwd) ? 'fill-[#f9e2af] text-[#f9e2af]' : ''} />
              </button>

              {/* Show Remote Bookmarks Dropdown */}
              <button
                onClick={() => setShowRemoteBookmarks(!showRemoteBookmarks)}
                className="px-1 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[8px] text-[#a6adc8]"
                title="Xem danh sách Bookmarks Remote"
              >
                Ghim
              </button>

              {showRemoteBookmarks && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRemoteBookmarks(false)} />
                  <div className="absolute right-2 top-8 z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[200px] max-w-[320px] max-h-[200px] overflow-y-auto scrollbar-thin">
                    <div className="px-2.5 py-1 text-[8px] font-bold text-[#585b70] border-b border-white/5 uppercase">Bookmarks đã ghim (Remote)</div>
                    {remoteBookmarks.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-[9px] text-[#585b70] italic">Trống</div>
                    ) : (
                      remoteBookmarks.map((b) => (
                        <div key={b} className="w-full flex items-center justify-between gap-2 px-2 py-1 hover:bg-white/5 text-[10px] text-[#cdd6f4]">
                          <button onClick={() => { setCwd(b); loadDir(b); setShowRemoteBookmarks(false) }} className="flex-1 text-left truncate font-mono text-[9px]">
                            {b}
                          </button>
                          <button onClick={() => handleRemoveRemoteBookmark(b)} className="text-[#f38ba8] hover:text-[#f38ba8]/80 text-[8px] px-1">Xóa</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Remote List */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                // Drop from Local to Remote -> upload files
                const rawData = e.dataTransfer.getData('text/plain')
                if (rawData && rawData.startsWith('local:')) {
                  const paths = rawData.replace('local:', '').split('\n')
                  handleUploadLocalToRemote(paths)
                } else if (e.dataTransfer.files.length > 0) {
                  // Drop from external Windows Explorer -> upload
                  const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(Boolean)
                  handleUploadLocalToRemote(paths)
                }
              }}
              className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin"
            >
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={14} className="animate-spin text-[#585b70]" /></div>
              ) : error ? (
                <div className="text-[10px] text-[#f38ba8] px-3 py-4">{error}</div>
              ) : filteredRemoteEntries.length === 0 ? (
                <div className="text-[10px] text-[#45475a] text-center py-8">Thư mục trống hoặc đã lọc hết</div>
              ) : (
                filteredRemoteEntries.map((entry, index) => (
                  <div
                    key={entry.path}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `remote:${entry.path}`)
                    }}
                    onClick={(e) => handleSelectRemote(e, entry, index)}
                    onDoubleClick={() => {
                      if (entry.isDirectory) enterDir(entry.path)
                      else handleOpenRemoteFile(entry.path)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setSelectedRemote(prev => prev.includes(entry.path) ? prev : [entry.path])
                      setCtxMenu({ x: e.clientX, y: e.clientY, entry, isRemote: true })
                    }}
                    className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all pr-[80px] ${
                      selectedRemote.includes(entry.path)
                        ? 'bg-[#fab387]/15 text-[#fab387]'
                        : compareActive
                          ? (() => {
                              const match = localEntries.find(l => l.name === entry.name)
                              if (!match) return 'hover:bg-white/[0.02] text-[#89b4fa]' // Chỉ có ở Remote
                              if (match.size !== entry.size) return 'hover:bg-white/[0.02] text-[#fab387]' // Khác kích thước
                              return 'hover:bg-white/[0.02] text-[#585b70]' // Khớp hoàn toàn
                            })()
                          : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {entry.isDirectory ? <Folder size={13} className="text-[#f9e2af] shrink-0" /> : <File size={13} className="text-[#89b4fa] shrink-0" />}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-[11px] truncate leading-none mb-0.5">{entry.name}</span>
                      {(showTime || showPermissions) && (
                        <div className="flex items-center gap-2 text-[8px] text-[#585b70]">
                          {showTime && entry.modifiedAt && <span>{formatTime(entry.modifiedAt)}</span>}
                          {showPermissions && entry.mode !== undefined && <span className="font-mono text-[#a6adc8] bg-white/5 px-1 rounded-sm">{formatMode(entry.mode)}</span>}
                        </div>
                      )}
                    </div>
                    {entry.isFile ? (
                      <span className="text-[9px] text-[#585b70] font-mono shrink-0 mr-1">{formatSize(entry.size)}</span>
                    ) : folderSizes[entry.path] !== undefined ? (
                      <span className="text-[9px] text-[#a6e3a1] font-mono shrink-0 mr-1" title="Kích thước thư mục đã quét">{formatSize(folderSizes[entry.path])}</span>
                    ) : null}
                    <div className="hidden group-hover:flex gap-1 absolute right-2 top-1/2 -translate-y-1/2 bg-[#1e1e2e]/90 px-1 py-0.5 rounded shadow border border-white/5">
                      {entry.isFile && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenRemoteFile(entry.path) }}
                            className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#89b4fa]"
                            title="Xem & Sửa file"
                          >
                            <Eye size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadRemoteToLocal([entry.path]) }}
                            className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]"
                            title="Tải về máy tính"
                          >
                            <FileDown size={12} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRemoteMultiple([entry]) }}
                        className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#f38ba8]"
                        title="Xóa"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Transfers Queue Bar WinSCP-style */}
        {transfers.length > 0 && (
          <div className="border-t border-white/5 bg-[#181825] shrink-0 flex flex-col max-h-[160px] overflow-hidden">
            <button
              onClick={() => setShowQueue(!showQueue)}
              className="flex justify-between items-center px-4 py-2 hover:bg-white/[0.02] transition-colors border-b border-white/[0.03] outline-none"
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] animate-pulse" />
                <span className="text-[10px] font-bold text-[#a6adc8] uppercase tracking-wider">Hàng đợi truyền tải tệp</span>
                <span className="text-[9px] text-[#585b70]">({transfers.filter(t => t.status === 'success').length} hoàn thành, {transfers.filter(t => t.status === 'active').length} đang chạy)</span>
              </div>
              <ChevronRight size={12} className={`text-[#585b70] transition-transform ${showQueue ? 'rotate-90' : 'rotate-270'}`} />
            </button>

            {showQueue && (
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-[#11111b]/30 scrollbar-thin">
                {transfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 text-[10px] bg-white/[0.01] border border-white/[0.03] rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2 truncate max-w-[180px]">
                      {t.type === 'upload' ? (
                        <FileUp size={11} className="text-[#a6e3a1] shrink-0" />
                      ) : (
                        <FileDown size={11} className="text-[#89b4fa] shrink-0" />
                      )}
                      <div className="flex flex-col truncate">
                        <span className="font-semibold text-[#cdd6f4] truncate" title={t.name}>{t.name}</span>
                        {t.status === 'active' && t.detail && (
                          <span className="text-[8px] text-[#585b70]">{t.detail}</span>
                        )}
                      </div>
                    </div>

                    {/* Progress & Speed */}
                    <div className="flex-1 flex items-center gap-2 max-w-[240px]">
                      <div className="flex-1 flex flex-col gap-0.5">
                        <div className="flex justify-between items-center text-[8px] text-[#585b70] font-mono px-0.5">
                          <span>{t.speed || ''}</span>
                          <span>{t.progress}%</span>
                        </div>
                        <div className="h-1 bg-[#313244] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              t.status === 'error' ? 'bg-[#f38ba8]' : t.status === 'success' ? 'bg-[#a6e3a1]' : 'bg-[#89b4fa]'
                            }`}
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase ${
                        t.status === 'success' ? 'text-[#a6e3a1]' : t.status === 'error' ? 'text-[#f38ba8]' : 'text-[#89b4fa]'
                      }`}>
                        {t.status === 'success' ? 'Hoàn tất' : t.status === 'error' ? 'Lỗi/Hủy' : 'Đang tải'}
                      </span>
                      {t.status === 'active' && (
                        <button
                          onClick={() => handleCancelTransfer(t.id)}
                          className="px-1.5 py-0.5 rounded bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#f38ba8] text-[9px]"
                          title="Hủy tiến trình truyền tải này"
                        >
                          Hủy
                        </button>
                      )}
                    </div>
                    {t.errorMsg && <span className="text-[9px] text-[#f38ba8] truncate max-w-[120px]" title={t.errorMsg}>{t.errorMsg}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {viewFile && (
        <FileViewer
          path={viewFile.path}
          content={viewFile.content}
          isRemote={viewFile.isRemote}
          onSave={handleSaveFileContent}
          onClose={() => setViewFile(null)}
        />
      )}

      {/* Right-click Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={
            ctxMenu.isRemote
              ? [
                  { label: 'Tải về (Download)', icon: FileDown, color: '#a6e3a1', onClick: () => handleDownloadRemoteToLocal(selectedRemote.includes(ctxMenu.entry.path) ? selectedRemote : [ctxMenu.entry.path]) },
                  { label: 'Xem & Sửa file', icon: Eye, onClick: () => handleOpenRemoteFile(ctxMenu.entry.path) },
                  { label: 'Tạo bản sao', icon: Copy, onClick: () => window.api.sftp.duplicate(sessionId || '', ctxMenu.entry.path).then(() => loadDir(cwd)) },
                  { label: 'Đổi tên', icon: Edit3, onClick: () => setInputDlg({
                    title: 'Đổi tên tệp tin',
                    defaultValue: ctxMenu.entry.name,
                    onConfirm: async (name) => {
                      setInputDlg(null)
                      if (!name || name === ctxMenu.entry.name || !sessionId) return
                      const sep = cwd.endsWith('/') ? '' : '/'
                      await window.api.sftp.move(sessionId, ctxMenu.entry.path, cwd + sep + name)
                      loadDir(cwd)
                    }
                  })},
                  { label: 'Nén thành Zip (Remote)', icon: FolderPlus, color: '#f9e2af', onClick: () => {
                    const tarName = ctxMenu.entry.name + '.tar.gz'
                    window.api.sftp.zip(sessionId || '', ctxMenu.entry.path, cwd.endsWith('/') ? cwd + tarName : cwd + '/' + tarName).then((res) => {
                      if (res.error) alert(res.error)
                      else loadDir(cwd)
                    })
                  }},
                  ...(ctxMenu.entry.name.endsWith('.zip') || ctxMenu.entry.name.endsWith('.gz') || ctxMenu.entry.name.endsWith('.tar')
                    ? [{
                        label: 'Giải nén tại đây (Remote)',
                        icon: FileDown,
                        color: '#a6e3a1',
                        onClick: () => {
                          window.api.sftp.unzip(sessionId || '', ctxMenu.entry.path, cwd).then((res) => {
                            if (res.error) alert(res.error)
                            else loadDir(cwd)
                          })
                        }
                      }]
                    : []
                  ),
                  { label: 'Phân quyền tệp (Chmod)', icon: Edit3, onClick: () => {
                    const currentMode = formatMode(ctxMenu.entry.mode) || '0644'
                    setInputDlg({
                      title: `Đặt quyền hạn tệp (Octal, vd: 0755, 0644) cho: ${ctxMenu.entry.name}`,
                      defaultValue: currentMode,
                      onConfirm: async (modeStr) => {
                        setInputDlg(null)
                        if (!modeStr || !sessionId) return
                        const newMode = parseInt(modeStr, 8)
                        if (isNaN(newMode)) {
                          alert('Quyền hạn octal không hợp lệ! Vui lòng nhập số như 0755 hoặc 0644.')
                          return
                        }
                        const res = await window.api.sftp.chmod(sessionId, ctxMenu.entry.path, newMode)
                        if (res.error) alert(res.error)
                        else loadDir(cwd)
                      }
                    })
                  }},
                  ...(ctxMenu.entry.isDirectory
                    ? [{
                        label: 'Tính dung lượng thư mục',
                        icon: Search,
                        onClick: () => handleCalculateFolderSize(ctxMenu.entry.path)
                      }]
                    : []
                  ),
                  { label: 'Xóa tệp', icon: Trash2, color: '#f38ba8', onClick: () => handleDeleteRemoteMultiple(selectedRemote.includes(ctxMenu.entry.path) ? entries.filter(e => selectedRemote.includes(e.path)) : [ctxMenu.entry]) }
                ]
              : [
                  { label: 'Tải lên Server', icon: FileUp, color: '#a6e3a1', onClick: () => handleUploadLocalToRemote(selectedLocal.includes(ctxMenu.entry.path) ? selectedLocal : [ctxMenu.entry.path]) },
                  { label: 'Chỉnh sửa tệp', icon: Eye, onClick: () => handleOpenLocalFile(ctxMenu.entry.path) },
                  { label: 'Đổi tên', icon: Edit3, onClick: () => setInputDlg({
                    title: 'Đổi tên tệp cục bộ',
                    defaultValue: ctxMenu.entry.name,
                    onConfirm: async (name) => {
                      setInputDlg(null)
                      if (!name || name === ctxMenu.entry.name) return
                      const sep = localCwd.endsWith('\\') || localCwd.endsWith('/') ? '' : '/'
                      await window.api.local.rename(ctxMenu.entry.path, localCwd + sep + name)
                      loadLocalDir(localCwd)
                    }
                  })},
                  { label: 'Nén thành Zip (Local)', icon: FolderPlus, color: '#89b4fa', onClick: () => {
                    const zipName = ctxMenu.entry.name + '.zip'
                    const sep = localCwd.endsWith('\\') || localCwd.endsWith('/') ? '' : '/'
                    window.api.local.zip(ctxMenu.entry.path, localCwd + sep + zipName).then((res) => {
                      if (res.error) alert(res.error)
                      else loadLocalDir(localCwd)
                    })
                  }},
                  ...(ctxMenu.entry.name.endsWith('.zip')
                    ? [{
                        label: 'Giải nén tại đây (Local)',
                        icon: FileDown,
                        color: '#a6e3a1',
                        onClick: () => {
                          window.api.local.unzip(ctxMenu.entry.path, localCwd).then((res) => {
                            if (res.error) alert(res.error)
                            else loadLocalDir(localCwd)
                          })
                        }
                      }]
                    : []
                  ),
                  { label: 'Xóa tệp', icon: Trash2, color: '#f38ba8', onClick: () => handleDeleteLocalMultiple(selectedLocal.includes(ctxMenu.entry.path) ? localEntries.filter(e => selectedLocal.includes(e.path)) : [ctxMenu.entry]) }
                ]
          }
        />
      )}

      {/* Input dialog (create/rename) */}
      {inputDlg && (
        <InputDialog
          title={inputDlg.title}
          defaultValue={inputDlg.defaultValue}
          onConfirm={inputDlg.onConfirm}
          onClose={() => setInputDlg(null)}
        />
      )}

      {/* Deploy Dialog */}
      {showDeployDlg && (
        <DeployDialog
          sessionId={sessionId}
          onClose={() => setShowDeployDlg(false)}
          onDeployed={(dir) => { setCwd(dir); loadDir(dir) }}
        />
      )}
    </>
  )
}
