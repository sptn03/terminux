import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Folder, File, FileUp, FileDown, Trash2, FolderPlus, ChevronRight, Home, RefreshCw, Loader2, X, Eye, Upload, Copy, Edit3, ArrowRight, Search, HardDrive, ArrowLeftRight } from 'lucide-react'
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
  const [cwd, setCwd] = useState('/')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>(['/'])
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Local state
  const [drives, setDrives] = useState<any[]>([])
  const [localCwd, setLocalCwd] = useState('')
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localHistory, setLocalHistory] = useState<string[]>([])
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
  }>>([])
  const [showQueue, setShowQueue] = useState(false)

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
        if (drvs.length > 0 && !localCwd) {
          setLocalCwd(drvs[0].path)
          setLocalHistory([drvs[0].path])
        }
      } catch {}
    }
    if (visible) initLocal()
  }, [visible])

  // Load Remote Dir
  const loadDir = useCallback(async (dir: string) => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    const result = await window.api.sftp.listDir(sessionId, dir)
    if (result.error) {
      setError(result.error)
      setEntries([])
    } else {
      setEntries(result)
    }
    setLoading(false)
  }, [sessionId])

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

  const enterLocalDir = (dirPath: string) => { setLocalHistory([...localHistory, dirPath]); setLocalCwd(dirPath) }
  const goLocalBack = () => {
    if (localHistory.length > 1) {
      const h = localHistory.slice(0, -1)
      setLocalHistory(h)
      setLocalCwd(h[h.length - 1])
    }
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

  // Queue tracking helpers
  const addTransfer = (name: string, type: 'upload' | 'download') => {
    const id = Math.random().toString(36).substring(7)
    setTransfers(prev => [{ id, name, type, status: 'active', progress: 30 }, ...prev])
    setShowQueue(true)
    return id
  }
  const updateTransfer = (id: string, updates: Partial<(typeof transfers)[0]>) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  // Action: Upload (Local -> Remote)
  const handleUploadLocalToRemote = async (paths: string[]) => {
    if (!sessionId || paths.length === 0) return
    const label = paths.length === 1
      ? paths[0].substring(paths[0].lastIndexOf('\\') + 1).substring(paths[0].lastIndexOf('/') + 1)
      : `${paths.length} tệp`
    const transferId = addTransfer(label, 'upload')
    try {
      updateTransfer(transferId, { progress: 60 })
      const result = await window.api.sftp.deploy(sessionId, localCwd, cwd, paths)
      if (result.errors && result.errors.length > 0) {
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
    const transferId = addTransfer(label, 'download')
    try {
      updateTransfer(transferId, { progress: 60 })
      const result = await window.api.sftp.downloadFiles(sessionId, paths, localCwd)
      if (result.errors && result.errors.length > 0) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: result.errors[0] })
      } else if (result.canceled) {
        updateTransfer(transferId, { status: 'error', progress: 100, errorMsg: 'Hủy bỏ' })
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

            {/* Path */}
            <div className="px-3 py-1.5 text-[9px] font-mono text-[#585b70] bg-[#11111b]/40 truncate border-b border-white/5" title={localCwd}>{localCwd}</div>

            {/* Local List */}
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
              {localLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={14} className="animate-spin text-[#585b70]" /></div>
              ) : filteredLocalEntries.length === 0 ? (
                <div className="text-[10px] text-[#45475a] text-center py-8">Thư mục trống</div>
              ) : (
                filteredLocalEntries.map((entry, index) => (
                  <div
                    key={entry.path}
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
                    className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                      selectedLocal.includes(entry.path) ? 'bg-[#89b4fa]/15 text-[#89b4fa]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {entry.isDirectory ? <Folder size={13} className="text-[#f9e2af] shrink-0" /> : <File size={13} className="text-[#89b4fa] shrink-0" />}
                    <span className="text-[11px] truncate flex-1 leading-none">{entry.name}</span>
                    {entry.isFile && <span className="text-[9px] text-[#585b70] font-mono">{formatSize(entry.size)}</span>}
                    <div className="hidden group-hover:flex gap-1">
                      {entry.isFile && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUploadLocalToRemote([entry.path]) }}
                          className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]"
                          title="Tải lên Server"
                        >
                          <FileUp size={12} />
                        </button>
                      )}
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
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 bg-[#1e1e2e]/50">
              <button onClick={goHome} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Gốc (Home)"><Home size={12} /></button>
              <button onClick={goBack} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Lùi lại"><ChevronRight size={12} className="rotate-180" /></button>
              <button onClick={() => loadDir(cwd)} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tải lại"><RefreshCw size={12} /></button>
              <div className="flex-1" />
              <button onClick={handleMkdirRemote} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]" title="Tạo thư mục mới"><FolderPlus size={12} /></button>
              <button onClick={() => setShowDeployDlg(true)} className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#a6e3a1]" title="Upload thư mục"><Upload size={12} /></button>
            </div>

            {/* Remote Search */}
            <div className="px-2 py-1.5 border-b border-white/5 bg-[#11111b]/20 flex items-center gap-1.5">
              <Search size={11} className="text-[#585b70]" />
              <input
                type="text"
                placeholder="Lọc file remote..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[10px] text-[#cdd6f4] outline-none placeholder-[#45475a]"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[#585b70] hover:text-[#cdd6f4]"><X size={10} /></button>}
            </div>

            {/* Path */}
            <div className="px-3 py-1.5 text-[9px] font-mono text-[#585b70] bg-[#11111b]/40 truncate border-b border-white/5" title={cwd}>{cwd}</div>

            {/* Remote List */}
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
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
                    className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                      selectedRemote.includes(entry.path) ? 'bg-[#fab387]/15 text-[#fab387]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {entry.isDirectory ? <Folder size={13} className="text-[#f9e2af] shrink-0" /> : <File size={13} className="text-[#89b4fa] shrink-0" />}
                    <span className="text-[11px] truncate flex-1 leading-none">{entry.name}</span>
                    {entry.isFile && <span className="text-[9px] text-[#585b70] font-mono">{formatSize(entry.size)}</span>}
                    <div className="hidden group-hover:flex gap-1">
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
                    <div className="flex items-center gap-2 truncate max-w-[200px]">
                      {t.type === 'upload' ? (
                        <FileUp size={11} className="text-[#a6e3a1] shrink-0" />
                      ) : (
                        <FileDown size={11} className="text-[#89b4fa] shrink-0" />
                      )}
                      <span className="font-semibold text-[#cdd6f4] truncate" title={t.name}>{t.name}</span>
                    </div>

                    {/* Progress */}
                    <div className="flex-1 flex items-center gap-2 max-w-[220px]">
                      <div className="flex-1 h-1 bg-[#313244] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            t.status === 'error' ? 'bg-[#f38ba8]' : t.status === 'success' ? 'bg-[#a6e3a1]' : 'bg-[#89b4fa]'
                          }`}
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-[9px] text-[#585b70] w-6 text-right">{t.progress}%</span>
                    </div>

                    <span className={`text-[9px] font-bold uppercase ${
                      t.status === 'success' ? 'text-[#a6e3a1]' : t.status === 'error' ? 'text-[#f38ba8]' : 'text-[#89b4fa]'
                    }`}>
                      {t.status === 'success' ? 'Hoàn tất' : t.status === 'error' ? 'Lỗi' : 'Đang tải'}
                    </span>
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
