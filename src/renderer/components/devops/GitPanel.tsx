import { useState, useEffect, useCallback } from 'react'
import { GitBranch, GitPullRequest, RefreshCw, Trash2, Plus, X, Terminal, ArrowLeft, AlertCircle, Play } from 'lucide-react'

interface GitRepo {
  id: string
  name: string
  path: string
  deployCmd: string
}

interface GitPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function GitPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: GitPanelProps) {
  const [repos, setRepos] = useState<GitRepo[]>([])
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null)
  
  // Active repo Git status
  const [gitBranch, setGitBranch] = useState('')
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([])
  const [recentCommits, setRecentCommits] = useState<{ hash: string; author: string; date: string; subject: string }[]>([])
  
  // UI states
  const [loadingGit, setLoadingGit] = useState(false)
  const [gitLogs, setGitLogs] = useState('')
  
  // Add repo modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('/var/www')
  const [newRepoDeploy, setNewRepoDeploy] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  const loadReposFromDb = useCallback(async () => {
    try {
      const rows = await window.api.db.all("SELECT value FROM app_settings WHERE key = 'devops_git_repositories'")
      if (rows.length > 0 && rows[0].value) {
        setRepos(JSON.parse(rows[0].value))
      } else {
        setRepos([])
      }
    } catch {}
  }, [])

  const saveReposToDb = async (updatedRepos: GitRepo[]) => {
    setRepos(updatedRepos)
    await window.api.db.run(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_git_repositories', ?)",
      [JSON.stringify(updatedRepos)]
    )
  }

  const fetchGitStatus = useCallback(async (repo: GitRepo) => {
    setLoadingGit(true)
    setGitLogs('')
    try {
      const cmd = `cd "${repo.path}" && git branch --show-current && echo "===STATUS===" && git status --porcelain && echo "===LOGS===" && git log -n 5 --pretty=format:"%h||%an||%ar||%s" 2>/dev/null || echo "not_a_repo"`
      const res = await exec(cmd)
      
      if (res.stdout.includes('not_a_repo')) {
        setGitBranch('Chưa khởi tạo Git / Thư mục không tồn tại')
        setModifiedFiles([])
        setRecentCommits([])
        setLoadingGit(false)
        return
      }

      const [branchSection, rest] = res.stdout.split('===STATUS===')
      const [statusSection, logsSection = ''] = (rest || '').split('===LOGS===')

      setGitBranch(branchSection.trim() || 'main')
      
      const files = statusSection.split('\n').map(s => s.trim()).filter(Boolean)
      setModifiedFiles(files)

      const commits = logsSection.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('||')
        return {
          hash: parts[0] || '',
          author: parts[1] || '',
          date: parts[2] || '',
          subject: parts[3] || ''
        }
      })
      setRecentCommits(commits)
    } catch (err: any) {
      console.error(err)
    }
    setLoadingGit(false)
  }, [exec])

  const handleAddRepo = async () => {
    if (!newRepoName.trim() || !newRepoPath.trim()) {
      alert('Vui lòng nhập tên dự án và đường dẫn!')
      return
    }

    const newRepo: GitRepo = {
      id: `git-${Date.now()}`,
      name: newRepoName.trim(),
      path: newRepoPath.trim(),
      deployCmd: newRepoDeploy.trim()
    }

    const updated = [...repos, newRepo]
    await saveReposToDb(updated)
    setShowAddModal(false)
    setNewRepoName('')
    setNewRepoDeploy('')
    setActiveRepoId(newRepo.id)
  }

  const handleDeleteRepo = async (id: string, name: string) => {
    if (!confirm(`Xóa cấu hình Git của dự án "${name}"?`)) return
    const updated = repos.filter(r => r.id !== id)
    await saveReposToDb(updated)
    if (activeRepoId === id) {
      setActiveRepoId(null)
    }
  }

  const handleGitAction = async (action: 'pull' | 'fetch' | 'reset' | 'deploy') => {
    const activeRepo = repos.find(r => r.id === activeRepoId)
    if (!activeRepo) return

    setLoadingGit(true)
    setGitLogs(`Bắt đầu chạy Git ${action.toUpperCase()}...\n`)

    try {
      let cmd = `cd "${activeRepo.path}"`
      if (action === 'fetch') {
        cmd += ' && git fetch'
      } else if (action === 'pull') {
        cmd += ' && git pull'
      } else if (action === 'reset') {
        cmd += ' && git reset --hard HEAD'
      } else {
        // deploy
        if (!activeRepo.deployCmd) {
          throw new Error('Chưa cấu hình câu lệnh triển khai (Deploy Command) cho dự án này.')
        }
        cmd += ` && ${activeRepo.deployCmd}`
      }

      const res = await exec(cmd)
      setGitLogs((prev) => prev + res.stdout + '\n' + res.stderr + '\n')
      if (res.code === 0) {
        setGitLogs((prev) => prev + `✅ Hoàn tất thao tác Git ${action.toUpperCase()} thành công!\n`)
        if (action === 'pull' && activeRepo.deployCmd) {
          setGitLogs((prev) => prev + `🚀 Tự động kích hoạt câu lệnh Deploy: ${activeRepo.deployCmd}...\n`)
          const depRes = await exec(`cd "${activeRepo.path}" && ${activeRepo.deployCmd}`)
          setGitLogs((prev) => prev + depRes.stdout + '\n' + depRes.stderr + '\n')
        }
        await fetchGitStatus(activeRepo)
      } else {
        throw new Error(res.stderr || 'Thao tác thất bại')
      }
    } catch (err: any) {
      setGitLogs((prev) => prev + `❌ Lỗi: ${err.message}\n`)
    } finally {
      setLoadingGit(false)
    }
  }

  useEffect(() => {
    loadReposFromDb()
  }, [loadReposFromDb, refreshKey])

  useEffect(() => {
    const active = repos.find(r => r.id === activeRepoId)
    if (active) {
      fetchGitStatus(active)
    } else {
      setGitBranch('')
      setModifiedFiles([])
      setRecentCommits([])
      setGitLogs('')
    }
  }, [activeRepoId, repos, fetchGitStatus])

  const activeRepo = repos.find(r => r.id === activeRepoId)

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Sidebar: repositories list */}
      <div className="w-60 min-w-60 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        <div className="px-3 py-2 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider flex justify-between items-center shrink-0">
          <span>Git Repositories</span>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-1 hover:bg-white/5 rounded text-[#89b4fa]"
            title="Thêm Repository"
          >
            <Plus size={12} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
          {repos.length === 0 ? (
            <div className="text-center text-[#585b70] text-[10px] py-8">Chưa cấu hình dự án nào.</div>
          ) : (
            repos.map((r) => (
              <div key={r.id} className="group flex items-center justify-between px-1 rounded-lg hover:bg-white/[0.02]">
                <button
                  onClick={() => setActiveRepoId(r.id)}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left truncate ${
                    activeRepoId === r.id ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#a6adc8]'
                  }`}
                >
                  <GitBranch size={12} className="shrink-0" />
                  <span className="truncate">{r.name}</span>
                </button>
                <button
                  onClick={() => handleDeleteRepo(r.id, r.name)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/5 text-[#f38ba8] transition-all shrink-0 mr-1"
                  title="Xóa cấu hình"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main repository deployment workspace */}
      <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative">
        {activeRepo ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action header bar */}
            <div className="px-4 py-2 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveRepoId(null)}
                  className="p-1 hover:bg-white/5 rounded text-[#a6adc8] hover:text-[#cdd6f4]"
                >
                  <ArrowLeft size={14} />
                </button>
                <span className="font-bold text-xs text-[#cdd6f4]">{activeRepo.name}</span>
                <span className="font-mono text-[10px] text-[#585b70] truncate max-w-[200px]" title={activeRepo.path}>
                  ({activeRepo.path})
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleGitAction('fetch')}
                  disabled={loadingGit}
                  className="px-2.5 py-1 rounded bg-white/5 text-[#cdd6f4] text-xs font-semibold hover:bg-white/10 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1"
                >
                  <RefreshCw size={11} className={loadingGit ? 'animate-spin' : ''} /> Fetch
                </button>
                <button
                  onClick={() => handleGitAction('pull')}
                  disabled={loadingGit}
                  className="px-2.5 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] text-xs font-semibold hover:bg-[#74c7ec] active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1"
                >
                  <GitPullRequest size={11} /> Pull & Deploy
                </button>
                <button
                  onClick={() => handleGitAction('reset')}
                  disabled={loadingGit}
                  className="px-2.5 py-1 rounded bg-white/5 text-[#f38ba8] text-xs font-semibold hover:bg-[#f38ba8]/10 active:scale-95 disabled:opacity-40 transition-all"
                  title="Discard local changes"
                >
                  Reset Hard
                </button>
                {activeRepo.deployCmd && (
                  <button
                    onClick={() => handleGitAction('deploy')}
                    disabled={loadingGit}
                    className="px-2.5 py-1 rounded bg-[#a6e3a1] text-[#1e1e2e] text-xs font-semibold hover:bg-[#86c581] active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    <Play size={11} /> Deploy Only
                  </button>
                )}
              </div>
            </div>

            {/* Split panel: Left details/commits, Right console logs */}
            <div className="flex-1 grid grid-cols-5 overflow-hidden">
              {/* Left 2 cols: Git state */}
              <div className="col-span-2 p-4 border-r border-white/[0.04] space-y-4 overflow-y-auto scrollbar-thin">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider block">Nhánh hiện tại (Branch)</label>
                  <span className="font-mono text-xs font-bold text-[#89b4fa] bg-[#89b4fa]/10 px-2 py-0.5 rounded-full inline-block">
                    {gitBranch || 'Checking...'}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider block">
                    File đã sửa đổi ({modifiedFiles.length})
                  </label>
                  <div className="bg-[#11111b] border border-white/5 rounded-lg p-2.5 font-mono text-[10px] max-h-32 overflow-y-auto scrollbar-thin">
                    {modifiedFiles.map((file, i) => (
                      <div key={i} className="text-[#f38ba8] truncate" title={file}>
                        {file}
                      </div>
                    ))}
                    {modifiedFiles.length === 0 && <div className="text-[#585b70] italic">Sạch sẽ (Clean)</div>}
                  </div>
                </div>

                <div className="space-y-2 flex-1">
                  <label className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider block">Lịch sử Commit gần đây</label>
                  <div className="space-y-2">
                    {recentCommits.map((c, i) => (
                      <div key={i} className="bg-[#11111b] border border-white/[0.02] rounded-lg p-2.5 text-[10px]">
                        <div className="flex justify-between font-mono mb-1">
                          <span className="text-[#89b4fa] font-bold">{c.hash}</span>
                          <span className="text-[#585b70]">{c.date}</span>
                        </div>
                        <div className="text-[#cdd6f4] font-semibold truncate" title={c.subject}>{c.subject}</div>
                        <div className="text-[#585b70] mt-0.5">Tác giả: {c.author}</div>
                      </div>
                    ))}
                    {recentCommits.length === 0 && <div className="text-[#585b70] text-center italic py-4">Chưa có lịch sử commit.</div>}
                  </div>
                </div>
              </div>

              {/* Right 3 cols: execution logs */}
              <div className="col-span-3 bg-[#11111b]/20 p-4 flex flex-col overflow-hidden">
                <span className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider mb-2 block">Nhật ký CI/CD & Git logs</span>
                <pre className="flex-1 overflow-y-auto font-mono text-xs text-[#a6adc8] whitespace-pre-wrap select-text bg-[#11111b] p-3 rounded-lg border border-white/[0.02] scrollbar-thin">
                  {gitLogs || 'Sẵn sàng.'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
            <GitPullRequest size={36} className="mb-2 opacity-30" />
            <span className="text-xs">Chọn hoặc thêm dự án Git để quản lý CI/CD</span>
          </div>
        )}
      </div>

      {/* Add Repo Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false)
          }}
        >
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Khai báo Dự án Git mới
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên Dự án (Project Name) *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="ví dụ: web-frontend"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none select-text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Đường dẫn thư mục nguồn (Directory Path) *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="/var/www/my-app"
                    value={newRepoPath}
                    onChange={(e) => setNewRepoPath(e.target.value)}
                    className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs flex items-center justify-center"
                  >
                    Duyệt...
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Lệnh triển khai (Deploy Command) <span className="text-[#585b70]">(Tùy chọn)</span></label>
                <input
                  type="text"
                  placeholder="ví dụ: npm install && pm2 restart app"
                  value={newRepoDeploy}
                  onChange={(e) => setNewRepoDeploy(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                />
                <span className="text-[10px] text-[#585b70]">Lệnh này sẽ tự động chạy sau khi hoàn tất Git Pull.</span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddRepo}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Khai Báo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <RemotePathPicker
          visible={true}
          mode="dir"
          exec={exec}
          onClose={() => setShowPicker(false)}
          onSelect={(path) => setNewRepoPath(path)}
        />
      )}
    </div>
  )
}

// Local RemotePathPicker for GitPanel
interface RemotePathPickerProps {
  visible: boolean
  mode: 'file' | 'dir'
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  onClose: () => void
  onSelect: (path: string) => void
}

function RemotePathPicker({ mode, exec, onClose, onSelect }: RemotePathPickerProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState<{ name: string; isDir: boolean }[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const sanitizedPath = path.replace(/"/g, '\\"')
      const cmd = `cd "${sanitizedPath}" && ls -F -1`
      const res = await exec(cmd)
      if (res.code === 0) {
        const parsed = res.stdout
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f && f !== './' && f !== '../')
          .map((f) => {
            const isDir = f.endsWith('/')
            const name = isDir ? f.slice(0, -1) : f
            return { name, isDir }
          })

        parsed.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1
          if (!a.isDir && b.isDir) return 1
          return a.name.localeCompare(b.name)
        })

        setItems(parsed)
        setCurrentPath(path)
      } else {
        alert('Lỗi đọc thư mục: ' + res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [exec])

  useEffect(() => {
    fetchDir('/')
  }, [fetchDir])

  const handleGoUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const parent = '/' + parts.join('/')
    fetchDir(parent)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] h-[480px] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#181825]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
            Chọn {mode === 'file' ? 'Tệp tin' : 'Thư mục'} trên Server
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
            <X size={14} />
          </button>
        </div>

        <div className="p-2.5 bg-[#11111b] border-b border-white/5 flex gap-2 items-center">
          <button
            onClick={handleGoUp}
            disabled={currentPath === '/'}
            className="px-2 py-1 rounded bg-white/5 text-xs text-[#cdd6f4] hover:bg-white/10 disabled:opacity-40"
          >
            ← Lên
          </button>
          <input
            type="text"
            readOnly
            value={currentPath}
            className="flex-1 bg-[#181825] border border-white/5 rounded px-2 py-1 text-xs text-[#a6adc8] font-mono outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-[#585b70] gap-2">
              <RefreshCw size={14} className="animate-spin text-[#89b4fa]" /> Đang tải...
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-[#585b70]">
              Thư mục trống.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
                  if (item.isDir) {
                    fetchDir(newPath)
                  } else {
                    if (mode === 'file') {
                      onSelect(newPath)
                      onClose()
                    }
                  }
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left text-[#a6adc8] hover:text-[#cdd6f4] hover:bg-white/[0.02] transition-all"
              >
                <span className="shrink-0 text-sm">
                  {item.isDir ? '📁' : '📄'}
                </span>
                <span className="truncate">{item.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-white/5 bg-[#181825] flex justify-between items-center">
          <span className="text-[9px] text-[#585b70]">
            {mode === 'file' ? 'Click file để chọn' : 'Bấm Chọn để lấy thư mục hiện tại'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10 text-xs"
            >
              Hủy
            </button>
            {mode === 'dir' && (
              <button
                type="button"
                onClick={() => {
                  onSelect(currentPath)
                  onClose()
                }}
                className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] text-xs active:scale-95 transition-all"
              >
                Chọn thư mục này
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
