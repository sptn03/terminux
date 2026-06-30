import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Folder, File, ChevronRight, Home, Loader2, Upload, Download, ArrowRightToLine, HardDrive, Server, RefreshCw, FolderPlus, Eye, EyeOff, Edit3, Trash2, Info, CheckSquare, Square, Copy, ArrowRight } from 'lucide-react'
import type { LocalEntry } from '../../types'

interface SftpEntry {
  name: string; path: string; size: number; isDirectory: boolean; isFile: boolean
}

interface DeployDialogProps {
  sessionId: string | null
  onClose: () => void
  onDeployed: (remoteDir: string) => void
}

type TransferMode = 'deploy' | 'download'

function Breadcrumb({ path, separator, onNavigate }: { path: string; separator: string; onNavigate: (dir: string) => void }) {
  const parts = path.split(separator).filter(Boolean)
  const accum: string[] = []
  const isWin = separator === '\\'
  let root = ''
  if (isWin) { const m = path.match(/^[A-Z]:\\/i); if (m) root = m[0] }
  else root = '/'

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-white/5 text-[9px] text-[#585b70] font-mono overflow-x-auto shrink-0 scrollbar-none">
      {isWin && root && (
        <>
          <button onClick={() => onNavigate(root)} className="hover:text-[#cdd6f4] shrink-0 px-0.5">{root.replace('\\', '')}</button>
          <span className="text-[#313244]">{separator}</span>
        </>
      )}
      {!isWin && (
        <button onClick={() => onNavigate('/')} className="hover:text-[#cdd6f4] shrink-0 px-0.5">/</button>
      )}
      {parts.map((part, i) => {
        accum.push(part)
        const full = isWin ? root + accum.join(separator) + (i < parts.length - 1 ? separator : '') : '/' + accum.join('/')
        return (
          <span key={i} className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="text-[#313244]">{separator}</span>
            <button onClick={() => onNavigate(full)} className="hover:text-[#cdd6f4]">{part}</button>
          </span>
        )
      })}
    </div>
  )
}

function InputDialog({ title, defaultValue, onConfirm, onClose }: {
  title: string; defaultValue?: string; onConfirm: (value: string) => void; onClose: () => void
}) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); inputRef.current?.select() }, [])
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

function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: { label: string; icon?: any; color?: string; onClick: () => void }[]; onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed z-[61] bg-[#1e1e2e] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[160px] slide-up"
        style={{ left: x, top: y }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => { item.onClick(); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
            style={{ color: item.color || '#cdd6f4' }}>
            {item.icon && <item.icon size={12} />}{item.label}
          </button>
        ))}
      </div>
    </>
  )
}

function LocalBrowser({ currentDir, onNavigate, onSelect, selectedFiles, onToggleFile, onDeployFile }: {
  currentDir: string; onNavigate: (dir: string) => void
  onSelect: (dir: string) => void
  selectedFiles: Set<string>; onToggleFile: (path: string) => void
  onDeployFile?: (path: string, isDir: boolean) => void
}) {
  const [entries, setEntries] = useState<LocalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: LocalEntry } | null>(null)
  const [inputDlg, setInputDlg] = useState<{ title: string; defaultValue?: string; onConfirm: (v: string) => void } | null>(null)

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true)
    const result = await window.api.local.listDir(dir)
    setEntries(result)
    setLoading(false)
  }, [])

  useEffect(() => { loadDir(currentDir) }, [currentDir])

  const handleMkdir = () => {
    setInputDlg({ title: 'New folder name', onConfirm: async (name) => {
      if (!name) return
      const sep = currentDir.includes('/') ? '/' : '\\'
      const path = currentDir.endsWith(sep) ? currentDir + name : currentDir + sep + name
      const result = await window.api.local.mkdir(path)
      setInputDlg(null)
      if (!result.error) loadDir(currentDir)
    }})
  }

  const handleRename = (entry: LocalEntry) => {
    setInputDlg({ title: 'Rename', defaultValue: entry.name, onConfirm: async (name) => {
      if (!name || name === entry.name) { setInputDlg(null); return }
      const sep = currentDir.includes('/') ? '/' : '\\'
      const newPath = (currentDir.endsWith(sep) ? currentDir + name : currentDir + sep + name)
      await window.api.local.rename(entry.path, newPath)
      setInputDlg(null)
      loadDir(currentDir)
    }})
  }

  const handleDelete = async (entry: LocalEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return
    try { await window.api.local.delete(entry.path); loadDir(currentDir) } catch {}
  }

  const displayEntries = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'))

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <Breadcrumb path={currentDir} separator={currentDir.includes('/') ? '/' : '\\'} onNavigate={onNavigate} />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 text-[9px] text-[#45475a] shrink-0">
        <div className="flex gap-0.5 items-center ml-auto">
          <button onClick={() => setShowHidden(!showHidden)} className={`p-0.5 rounded hover:bg-white/5 ${showHidden ? 'text-[#89b4fa]' : ''}`} title="Show hidden files">
            {showHidden ? <Eye size={10} /> : <EyeOff size={10} />}</button>
          <button onClick={() => loadDir(currentDir)} className="p-0.5 rounded hover:bg-white/5" title="Refresh"><RefreshCw size={10} /></button>
          <button onClick={handleMkdir} className="p-0.5 rounded hover:bg-white/5" title="New Folder"><FolderPlus size={10} /></button>
          <button onClick={() => onSelect(currentDir)} className="px-1.5 py-0.5 rounded bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 text-[9px]">Select</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? <div className="flex justify-center py-4"><Loader2 size={12} className="animate-spin text-[#585b70]" /></div> : (
          displayEntries.length === 0 ? <div className="text-[10px] text-[#45475a] px-2 py-4 text-center">Empty</div> : (
            displayEntries.map((entry) => (
              <div key={entry.path}
                className={`group flex items-center gap-1 px-2 py-1 hover:bg-white/[0.02] cursor-pointer text-[10px] ${entry.name.startsWith('.') ? 'opacity-60' : ''}`}
                onClick={() => entry.isDirectory ? onNavigate(entry.path) : onToggleFile(entry.path)}
                onDoubleClick={() => entry.isDirectory && onNavigate(entry.path)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, entry }) }}>
                {!entry.isDirectory && (
                  <span className="shrink-0">{selectedFiles.has(entry.path) ? <CheckSquare size={11} className="text-[#a6e3a1]" /> : <Square size={11} className="text-[#45475a]" />}</span>
                )}
                {entry.isDirectory && <span className="w-[11px] shrink-0" />}
                {entry.isDirectory ? <Folder size={11} className="text-[#f9e2af] shrink-0" /> : <File size={11} className="text-[#89b4fa] shrink-0" />}
                <span className="truncate flex-1">{entry.name}</span>
                {!entry.isDirectory && (
                  <span className="text-[9px] text-[#45475a] shrink-0">
                    {entry.size < 1024 ? `${entry.size}B` : entry.size < 1048576 ? `${(entry.size/1024).toFixed(0)}K` : `${(entry.size/1048576).toFixed(1)}M`}
                  </span>
                )}
              </div>
            ))
          )
        )}
      </div>
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          ...(onDeployFile ? [{ label: `▶ Deploy${ctxMenu.entry.isDirectory ? ' folder' : ''}`, icon: Folder, color: '#a6e3a1', onClick: () => onDeployFile(ctxMenu.entry.path, ctxMenu.entry.isDirectory) }] : []),
          { label: 'Select for transfer', icon: CheckSquare, color: '#a6e3a1', onClick: () => { if (!ctxMenu.entry.isDirectory) onToggleFile(ctxMenu.entry.path) } },
          { label: 'Rename', icon: Edit3, onClick: () => handleRename(ctxMenu.entry) },
          { label: 'Delete', icon: Trash2, color: '#f38ba8', onClick: () => handleDelete(ctxMenu.entry) },
          { label: `Info: ${ctxMenu.entry.isDirectory ? 'Folder' : 'File'}, ${ctxMenu.entry.size} bytes`, icon: Info, color: '#585b70', onClick: () => {} },
        ]} />
      )}
      {inputDlg && <InputDialog title={inputDlg.title} defaultValue={inputDlg.defaultValue} onConfirm={inputDlg.onConfirm} onClose={() => setInputDlg(null)} />}
    </div>
  )
}

function RemoteBrowser({ sessionId, currentDir, onNavigate, selectedFiles, onToggleFile, onDownloadFile }: {
  sessionId: string | null; currentDir: string; onNavigate: (dir: string) => void
  selectedFiles: Set<string>; onToggleFile: (path: string) => void
  onDownloadFile?: (path: string, isDir: boolean) => void
}) {
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showHidden, setShowHidden] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: SftpEntry } | null>(null)
  const [inputDlg, setInputDlg] = useState<{ title: string; defaultValue?: string; onConfirm: (v: string) => void } | null>(null)

  const loadDir = useCallback(async (dir: string) => {
    if (!sessionId) return
    setLoading(true)
    const result = await window.api.sftp.listDir(sessionId, dir)
    if (!result.error) setEntries(result)
    setLoading(false)
  }, [sessionId])

  useEffect(() => { loadDir(currentDir) }, [currentDir, refreshKey])

  const handleMkdir = () => {
    setInputDlg({ title: 'New folder name', onConfirm: async (name) => {
      if (!name || !sessionId) { setInputDlg(null); return }
      const sep = currentDir.endsWith('/') ? '' : '/'
      const result = await window.api.sftp.mkdir(sessionId, currentDir + sep + name)
      setInputDlg(null)
      if (!result.error) setRefreshKey(k => k + 1)
    }})
  }

  const handleRename = (entry: SftpEntry) => {
    setInputDlg({ title: 'Rename', defaultValue: entry.name, onConfirm: async (name) => {
      if (!name || !sessionId) { setInputDlg(null); return }
      const sep = currentDir.endsWith('/') ? '' : '/'
      const newPath = currentDir + sep + name
      const result = await window.api.sftp.rename(sessionId, entry.path, newPath)
      setInputDlg(null)
      if (!result.error) setRefreshKey(k => k + 1)
    }})
  }

  const handleDuplicate = async (entry: SftpEntry) => {
    if (!sessionId) return
    await window.api.sftp.duplicate(sessionId, entry.path)
    setRefreshKey(k => k + 1)
  }

  const handleMove = (entry: SftpEntry) => {
    setInputDlg({ title: 'Move to path', defaultValue: entry.path, onConfirm: async (newPath) => {
      if (!newPath || !sessionId) { setInputDlg(null); return }
      await window.api.sftp.move(sessionId, entry.path, newPath)
      setInputDlg(null)
      setRefreshKey(k => k + 1)
    }})
  }

  const handleDelete = async (entry: SftpEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return
    if (!sessionId) return
    if (entry.isDirectory) await window.api.sftp.deleteDir(sessionId, entry.path)
    else await window.api.sftp.deleteFile(sessionId, entry.path)
    setRefreshKey(k => k + 1)
  }

  const displayEntries = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'))

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <Breadcrumb path={currentDir} separator="/" onNavigate={onNavigate} />
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 text-[9px] text-[#45475a] shrink-0">
        <div className="flex gap-0.5 items-center ml-auto">
          <button onClick={() => setShowHidden(!showHidden)} className={`p-0.5 rounded hover:bg-white/5 ${showHidden ? 'text-[#89b4fa]' : ''}`}>
            {showHidden ? <Eye size={10} /> : <EyeOff size={10} />}</button>
          <button onClick={() => setRefreshKey(k => k + 1)} className="p-0.5 rounded hover:bg-white/5"><RefreshCw size={10} /></button>
          <button onClick={handleMkdir} className="p-0.5 rounded hover:bg-white/5"><FolderPlus size={10} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? <div className="flex justify-center py-4"><Loader2 size={12} className="animate-spin text-[#585b70]" /></div> : (
          displayEntries.length === 0 ? <div className="text-[10px] text-[#45475a] px-2 py-4 text-center">Empty</div> : (
            displayEntries.map((entry) => (
              <div key={entry.path}
                className={`group flex items-center gap-1 px-2 py-1 hover:bg-white/[0.02] cursor-pointer text-[10px] ${entry.name.startsWith('.') ? 'opacity-60' : ''}`}
                onClick={() => entry.isDirectory ? onNavigate(entry.path) : onToggleFile(entry.path)}
                onDoubleClick={() => entry.isDirectory && onNavigate(entry.path)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, entry }) }}>
                {!entry.isDirectory && (
                  <span className="shrink-0">{selectedFiles.has(entry.path) ? <CheckSquare size={11} className="text-[#a6e3a1]" /> : <Square size={11} className="text-[#45475a]" />}</span>
                )}
                {entry.isDirectory && <span className="w-[11px] shrink-0" />}
                {entry.isDirectory ? <Folder size={11} className="text-[#f9e2af] shrink-0" /> : <File size={11} className="text-[#fab387] shrink-0" />}
                <span className="truncate flex-1">{entry.name}</span>
                {!entry.isDirectory && (
                  <span className="text-[9px] text-[#45475a] shrink-0">
                    {entry.size < 1024 ? `${entry.size}B` : entry.size < 1048576 ? `${(entry.size/1024).toFixed(0)}K` : `${(entry.size/1048576).toFixed(1)}M`}
                  </span>
                )}
              </div>
            ))
          )
        )}
      </div>
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          ...(onDownloadFile ? [{ label: `◀ Download${ctxMenu.entry.isDirectory ? ' folder' : ''}`, icon: Download, color: '#89b4fa', onClick: () => onDownloadFile(ctxMenu.entry.path, ctxMenu.entry.isDirectory) }] : []),
          { label: 'Select for transfer', icon: CheckSquare, color: '#a6e3a1', onClick: () => { if (!ctxMenu.entry.isDirectory) onToggleFile(ctxMenu.entry.path) } },
          { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicate(ctxMenu.entry) },
          { label: 'Rename', icon: Edit3, onClick: () => handleRename(ctxMenu.entry) },
          { label: 'Move', icon: ArrowRight, onClick: () => handleMove(ctxMenu.entry) },
          { label: 'Delete', icon: Trash2, color: '#f38ba8', onClick: () => handleDelete(ctxMenu.entry) },
        ]} />
      )}
      {inputDlg && <InputDialog title={inputDlg.title} defaultValue={inputDlg.defaultValue} onConfirm={inputDlg.onConfirm} onClose={() => setInputDlg(null)} />}
    </div>
  )
}

export default function DeployDialog({ sessionId, onClose, onDeployed }: DeployDialogProps) {
  const [mode, setMode] = useState<TransferMode>('deploy')
  const [localDir, setLocalDir] = useState('')
  const [remoteDir, setRemoteDir] = useState('/')
  const [transferring, setTransferring] = useState(false)
  const [progress, setProgress] = useState('')
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<Set<string>>(new Set())
  const [selectedRemoteFiles, setSelectedRemoteFiles] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    window.api.local.getDrives().then((drives) => {
      if (drives.length > 0) setLocalDir(drives[0].path)
    })
  }, [])

  const handleQuickDeploy = async (localPath: string, isDir: boolean) => {
    if (!sessionId) return
    if (isDir) {
      setTransferring(true)
      setProgress('Deploying folder...')
      const result = await window.api.sftp.deploy(sessionId, localPath, remoteDir)
      setProgress(result.uploaded === result.total ? `✅ Deployed ${result.uploaded} files` : `⚠️ ${result.uploaded}/${result.total}`)
      setTransferring(false)
      setRefreshKey(k => k + 1)
    } else {
      setSelectedLocalFiles(new Set([localPath]))
      setTransferring(true)
      setProgress('Uploading file...')
      const result = await window.api.sftp.deploy(sessionId, localPath, remoteDir, [localPath])
      setProgress(result.uploaded === result.total ? '✅ Uploaded' : '⚠️ Error')
      setTransferring(false)
      setRefreshKey(k => k + 1)
    }
  }

  const handleQuickDownload = async (remotePath: string, isDir: boolean) => {
    if (!sessionId) return
    setTransferring(true)
    setProgress('Downloading...')
    const result = await window.api.sftp.downloadFiles(sessionId, [remotePath])
    setProgress(result.canceled ? 'Cancelled' : result.downloaded === result.total ? `✅ Downloaded ${result.downloaded} files` : `⚠️ ${result.downloaded}/${result.total}`)
    setTransferring(false)
  }

  const handleTransfer = async () => {
    if (!sessionId || !localDir) return

    if (mode === 'deploy') {
      const fileList = selectedLocalFiles.size > 0 ? Array.from(selectedLocalFiles) : undefined
      setTransferring(true)
      setProgress(fileList ? `Uploading ${fileList.length} files...` : 'Scanning folder...')
      const result = await window.api.sftp.deploy(sessionId, localDir, remoteDir, fileList)
      setProgress(result.uploaded === result.total
        ? `✅ Uploaded ${result.uploaded} files`
        : `⚠️ ${result.uploaded}/${result.total} (${result.errors.length} errors)`)
      setTransferring(false)
      onDeployed(remoteDir)
      setRefreshKey(k => k + 1)
    } else {
      if (selectedRemoteFiles.size === 0) return
      setTransferring(true)
      setProgress(`Downloading ${selectedRemoteFiles.size} files...`)
      const result = await window.api.sftp.downloadFiles(sessionId, Array.from(selectedRemoteFiles))
      setProgress(result.canceled ? 'Cancelled' : result.downloaded === result.total
        ? `✅ Downloaded ${result.downloaded} files`
        : `⚠️ ${result.downloaded}/${result.total} (${result.errors.length} errors)`)
      setTransferring(false)
    }
  }

  const selectAllLocal = () => {
    setSelectedLocalFiles(prev => {
      // If all already selected, deselect all
      if (prev.size > 0) return new Set()
      const all = new Set<string>()
      // We can't easily access entries here, so just select current dir
      return all
    })
  }

  const toggleLocalFile = (path: string) => {
    setSelectedLocalFiles(prev => { const n = new Set(prev); if (n.has(path)) n.delete(path); else n.add(path); return n })
  }

  const toggleRemoteFile = (path: string) => {
    setSelectedRemoteFiles(prev => { const n = new Set(prev); if (n.has(path)) n.delete(path); else n.add(path); return n })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dialog-overlay" onClick={onClose}>
      <div className="bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl w-[900px] h-[620px] flex flex-col modal-enter" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {mode === 'deploy' ? <Upload size={14} className="text-[#a6e3a1]" /> : <Download size={14} className="text-[#89b4fa]" />}
            {mode === 'deploy' ? 'Deploy → Remote' : 'Download ← Local'}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#181825] rounded-lg p-0.5 border border-white/5">
              <button onClick={() => setMode('deploy')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${mode === 'deploy' ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'text-[#585b70] hover:text-[#cdd6f4]'}`}>
                <Upload size={11} className="inline mr-1" />Deploy
              </button>
              <button onClick={() => setMode('download')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${mode === 'download' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#585b70] hover:text-[#cdd6f4]'}`}>
                <Download size={11} className="inline mr-1" />Download
              </button>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"><X size={14} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Local in deploy mode, Remote in download mode */}
          <div className="flex-1 flex flex-col border-r border-white/5 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 text-[10px] font-medium text-[#cdd6f4] shrink-0">
              {mode === 'deploy' ? <HardDrive size={11} className="text-[#89b4fa]" /> : <Server size={11} className="text-[#fab387]" />}
              {mode === 'deploy' ? 'Local' : 'Remote'}
              {selectedLocalFiles.size > 0 && mode === 'deploy' && <span className="text-[#a6e3a1] ml-auto">({selectedLocalFiles.size} files)</span>}
              {selectedRemoteFiles.size > 0 && mode === 'download' && <span className="text-[#89b4fa] ml-auto">({selectedRemoteFiles.size} files)</span>}
            </div>
            {mode === 'deploy' ? (
              <LocalBrowser currentDir={localDir} onNavigate={(d) => setLocalDir(d)}
                onSelect={(d) => setLocalDir(d)}
                selectedFiles={selectedLocalFiles} onToggleFile={toggleLocalFile}
                onDeployFile={handleQuickDeploy} />
            ) : (
              <RemoteBrowser sessionId={sessionId} currentDir={remoteDir} onNavigate={(d) => setRemoteDir(d)}
                selectedFiles={selectedRemoteFiles} onToggleFile={toggleRemoteFile}
                onDownloadFile={handleQuickDownload} />
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center px-3 bg-[#11111b] shrink-0">
            <ArrowRightToLine size={18} className={`${mode === 'deploy' ? 'text-[#a6e3a1]' : 'text-[#89b4fa]'} ${mode === 'download' ? 'rotate-180' : ''}`} />
          </div>

          {/* Right: Remote in deploy mode, Local in download mode */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 text-[10px] font-medium text-[#cdd6f4] shrink-0">
              {mode === 'deploy' ? <Server size={11} className="text-[#fab387]" /> : <HardDrive size={11} className="text-[#89b4fa]" />}
              {mode === 'deploy' ? 'Remote' : 'Local (destination)'}
              {mode === 'deploy' && selectedLocalFiles.size > 0 && <span className="text-[#a6e3a1] ml-auto">{selectedLocalFiles.size} files</span>}
              {mode === 'download' && <button onClick={() => { window.api.local.selectDir().then(d => d && setLocalDir(d)) }} className="ml-auto text-[9px] text-[#585b70] hover:text-[#cdd6f4]">Browse</button>}
            </div>
            {mode === 'deploy' ? (
              <RemoteBrowser sessionId={sessionId} currentDir={remoteDir} onNavigate={(d) => setRemoteDir(d)}
                selectedFiles={selectedLocalFiles} onToggleFile={toggleLocalFile}
                onDownloadFile={handleQuickDownload} />
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 text-[10px] font-medium text-[#cdd6f4] shrink-0">
                  <HardDrive size={11} className="text-[#89b4fa]" />
                  Local (destination)
                  <button onClick={() => { window.api.local.selectDir().then(d => d && setLocalDir(d)) }} className="ml-auto text-[9px] text-[#585b70] hover:text-[#cdd6f4]">Browse</button>
                </div>
                {localDir ? (
                  <LocalBrowser currentDir={localDir} onNavigate={(d) => setLocalDir(d)}
                    onSelect={(d) => setLocalDir(d)}
                    selectedFiles={new Set()} onToggleFile={() => {}} />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-[#45475a]">
                    Click <strong className="mx-1 text-[#585b70]">Browse</strong> to select destination folder
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/5 shrink-0">
          <div className="flex-1 text-[10px] text-[#585b70] truncate space-x-1">
            {mode === 'deploy' ? (
              <><span className="text-[#45475a]">Local:</span><span>{localDir}</span>
                {selectedLocalFiles.size > 0 && <span className="text-[#a6e3a1]">({selectedLocalFiles.size} files)</span>}
                <span className="text-[#45475a] mx-1">→</span>
                <span className="text-[#45475a]">Remote:</span><span>{remoteDir}</span></>
            ) : (
              <><span className="text-[#45475a]">Remote:</span><span>{remoteDir}</span>
                {selectedRemoteFiles.size > 0 && <span className="text-[#89b4fa]">({selectedRemoteFiles.size} files)</span>}
                <span className="text-[#45475a] mx-1">→</span>
                <span className="text-[#45475a]">Local:</span><span>{localDir || '(not set)'}</span></>
            )}
          </div>
          <button onClick={handleTransfer}
            disabled={transferring || !localDir || !sessionId || (mode === 'download' && selectedRemoteFiles.size === 0)}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{ backgroundColor: mode === 'deploy' ? 'rgba(166,227,161,0.1)' : 'rgba(137,180,250,0.1)', color: mode === 'deploy' ? '#a6e3a1' : '#89b4fa' }}>
            {transferring ? 'Transferring...' : mode === 'deploy' ? '▶ Deploy' : selectedRemoteFiles.size > 0 ? `▶ Download ${selectedRemoteFiles.size} files` : '▶ Download'}
          </button>
        </div>
        {progress && <div className="px-4 pb-2 text-[10px] text-[#585b70]">{progress}</div>}
      </div>
    </div>
  )
}
