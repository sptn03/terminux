import { useState, useEffect, useCallback } from 'react'
import { Box, Square, Play, RefreshCw, FileText, Trash2, X } from 'lucide-react'

interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  ports: string
}

interface DockerImage {
  repository: string
  tag: string
  id: string
  size: string
}

interface DockerPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export default function DockerPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: DockerPanelProps) {
  const [dockerInstalled, setDockerInstalled] = useState(true)
  const [dockerSubTab, setDockerSubTab] = useState<'containers' | 'images' | 'compose' | 'networks' | 'volumes' | 'config'>('containers')
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [images, setImages] = useState<DockerImage[]>([])
  const [selectedContainerLogs, setSelectedContainerLogs] = useState<{ id: string; name: string; logs: string } | null>(null)

  // New states for compose, networks, volumes
  const [composeProjects, setComposeProjects] = useState<{ name: string; status: string; configFiles: string }[]>([])
  const [networks, setNetworks] = useState<{ id: string; name: string; driver: string; scope: string }[]>([])
  const [volumes, setVolumes] = useState<{ name: string; driver: string; mountpoint: string }[]>([])
  const [containerStats, setContainerStats] = useState<Record<string, { cpu: string; mem: string }>>({})

  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')
  const [daemonConfig, setDaemonConfig] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const fetchDocker = useCallback(async (checkVersion = false) => {
    try {
      if (checkVersion) {
        const checkDocker = await exec('docker --version 2>/dev/null')
        if (checkDocker.code !== 0) {
          setDockerInstalled(false)
          return
        }
        setDockerInstalled(true)
      }

      if (dockerSubTab === 'containers') {
        const cmd = "docker ps -a --format '{{.ID}}||{{.Names}}||{{.Image}}||{{.Status}}||{{.Ports}}' 2>/dev/null && echo '===STATS===' && docker stats --no-stream --format '{{.Name}}||{{.CPUPerc}}||{{.MemUsage}}' 2>/dev/null || echo ''"
        const { stdout, code } = await exec(cmd)
        if (code === 127) {
          setDockerInstalled(false)
          return
        }
        const [psSection, statsSection] = stdout.split('===STATS===')

        const list = (psSection || '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('||')
            return {
              id: parts[0] || '',
              name: parts[1] || '',
              image: parts[2] || '',
              status: parts[3] || '',
              ports: parts[4] || '-'
            }
          })
        setContainers(list)

        if (statsSection) {
          const statsMap: Record<string, { cpu: string; mem: string }> = {}
          statsSection.split('\n').filter(Boolean).forEach((line) => {
            const parts = line.split('||')
            if (parts.length >= 3) {
              statsMap[parts[0].trim()] = { cpu: parts[1].trim(), mem: parts[2].trim() }
            }
          })
          setContainerStats(statsMap)
        }
      } else if (dockerSubTab === 'images') {
        const { stdout, code } = await exec(`docker images --format '{{.Repository}}||{{.Tag}}||{{.ID}}||{{.Size}}' 2>/dev/null`)
        if (code === 127) {
          setDockerInstalled(false)
          return
        }
        const list = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('||')
            return {
              repository: parts[0] || '',
              tag: parts[1] || '',
              id: parts[2] || '',
              size: parts[3] || ''
            }
          })
        setImages(list)
      } else if (dockerSubTab === 'compose') {
        const { stdout, code } = await exec("docker compose ls --format 'table' 2>/dev/null || docker-compose ls 2>/dev/null || echo ''")
        if (code === 127) {
          setDockerInstalled(false)
          return
        }
        const lines = stdout.split('\n').slice(1).filter(Boolean)
        const projects = lines.map((line) => {
          const parts = line.trim().replace(/\s+/g, '||').split('||')
          return { name: parts[0] || '', status: parts[1] || '', configFiles: parts[2] || '' }
        }).filter(p => p.name)
        setComposeProjects(projects)
      } else if (dockerSubTab === 'networks') {
        const { stdout, code } = await exec("docker network ls --format '{{.ID}}||{{.Name}}||{{.Driver}}||{{.Scope}}' 2>/dev/null")
        if (code === 127) {
          setDockerInstalled(false)
          return
        }
        const list = stdout.split('\n').filter(Boolean).map((line) => {
          const parts = line.split('||')
          return { id: parts[0] || '', name: parts[1] || '', driver: parts[2] || '', scope: parts[3] || '' }
        })
        setNetworks(list)
      } else if (dockerSubTab === 'volumes') {
        const { stdout, code } = await exec("docker volume ls --format '{{.Name}}||{{.Driver}}||{{.Mountpoint}}' 2>/dev/null")
        if (code === 127) {
          setDockerInstalled(false)
          return
        }
        const list = stdout.split('\n').filter(Boolean).map((line) => {
          const parts = line.split('||')
          return { name: parts[0] || '', driver: parts[1] || '', mountpoint: parts[2] || '' }
        })
        setVolumes(list)
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi tải thông tin Docker')
    }
  }, [exec, dockerSubTab, setError])

  const handleDockerContainerAction = async (action: 'start' | 'stop' | 'restart' | 'rm', containerId: string) => {
    setLoading(true)
    const { stderr } = await exec(`docker ${action} ${containerId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchDocker()
    setLoading(false)
  }

  const handleDockerImageAction = async (action: 'rmi', imageId: string) => {
    setLoading(true)
    const { stderr } = await exec(`docker ${action} ${imageId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchDocker()
    setLoading(false)
  }

  const handleViewDockerContainerLogs = async (containerId: string, containerName: string) => {
    setLoading(true)
    const { stdout, stderr } = await exec(`docker logs --tail 100 ${containerId} 2>&1`)
    setSelectedContainerLogs({
      id: containerId,
      name: containerName,
      logs: stripAnsi(stdout || stderr || 'Không tìm thấy log nào.')
    })
    setLoading(false)
  }

  const handleInstallDocker = async () => {
    setInstalling(true)
    setInstallLog('Đang chuẩn bị cài đặt Docker...\n')
    try {
      setInstallLog(prev => prev + 'Đang cập nhật danh sách gói (apt-get update)...\n')
      await exec('sudo apt-get update')
      
      setInstallLog(prev => prev + 'Đang cài đặt Docker Engine...\n')
      const res = await exec('sudo apt-get install -y docker.io')
      
      if (res.code === 0) {
        setInstallLog(prev => prev + 'Cài đặt thành công! Đang khởi chạy Docker...\n')
        await exec('sudo systemctl start docker && sudo systemctl enable docker')
        alert('Cài đặt Docker thành công!')
      } else {
        setInstallLog(prev => prev + 'Không thể cài bằng apt. Đang thử bằng script chính thức từ get.docker.com...\n')
        const scriptRes = await exec('curl -fsSL https://get.docker.com | sh')
        if (scriptRes.code === 0) {
          setInstallLog(prev => prev + 'Cài đặt thành công bằng script!\n')
          await exec('sudo systemctl start docker && sudo systemctl enable docker')
          alert('Cài đặt Docker thành công!')
        } else {
          throw new Error(scriptRes.stderr || res.stderr || 'Lỗi cài đặt thất bại.')
        }
      }
      await loadData()
    } catch (e: any) {
      setInstallLog(prev => prev + `Lỗi: ${e.message}\n`)
      alert('Lỗi cài đặt Docker: ' + e.message)
    } finally {
      setInstalling(false)
    }
  }

  const fetchDaemonConfig = useCallback(async () => {
    setLoading(true)
    try {
      const { stdout, code } = await exec('sudo cat /etc/docker/daemon.json 2>/dev/null || cat /etc/docker/daemon.json 2>/dev/null')
      if (code !== 0 || !stdout.trim()) {
        setDaemonConfig('{\n  "registry-mirrors": [],\n  "insecure-registries": [],\n  "experimental": false\n}')
      } else {
        setDaemonConfig(stdout)
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi đọc file cấu hình Docker daemon')
    } finally {
      setLoading(false)
    }
  }, [exec, setLoading, setError])

  const handleSaveDaemonConfig = async () => {
    if (savingConfig) return
    setSavingConfig(true)
    try {
      try {
        JSON.parse(daemonConfig)
      } catch (err: any) {
        alert('Lỗi định dạng JSON: ' + err.message)
        setSavingConfig(false)
        return
      }

      const tempFile = '/tmp/docker_daemon_config'
      const writeCmd = `cat << 'EOF' > ${tempFile}\n${daemonConfig}\nEOF\nsudo mv ${tempFile} /etc/docker/daemon.json`
      const res = await exec(writeCmd)
      if (res.code !== 0) {
        throw new Error(res.stderr || 'Không thể lưu file daemon.json')
      }

      const restartRes = await exec('sudo systemctl restart docker || systemctl restart docker')
      if (restartRes.code !== 0) {
        alert('Đã lưu cấu hình nhưng khởi động lại dịch vụ Docker thất bại: ' + (restartRes.stderr || restartRes.stdout))
      } else {
        alert('Đã lưu cấu hình và khởi động lại dịch vụ Docker thành công!')
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setSavingConfig(false)
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchDocker(true)
    if (dockerSubTab === 'config') {
      await fetchDaemonConfig()
    }
    setLoading(false)
  }, [fetchDocker, fetchDaemonConfig, dockerSubTab, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    if (!dockerInstalled || dockerSubTab === 'config') return
    const interval = setInterval(fetchDocker, 5000)
    return () => clearInterval(interval)
  }, [fetchDocker, dockerInstalled, dockerSubTab])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!dockerInstalled ? (
        <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-md mx-auto p-6 text-center space-y-4">
          <Box size={48} className="text-[#89b4fa] opacity-60 animate-bounce" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#cdd6f4]">Docker chưa được cài đặt hoặc chưa khởi động</h3>
            <p className="text-xs text-[#585b70]">Không tìm thấy lệnh docker trên máy chủ SSH này. Bạn có thể tự động cài đặt Docker thông qua trình quản lý gói của hệ thống.</p>
          </div>
          
          {installing ? (
            <div className="w-full bg-[#181825] border border-white/5 rounded-xl p-4 flex flex-col text-left space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#89b4fa] tracking-wider animate-pulse flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Đang cài đặt Docker...
              </span>
              <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[9px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                {installLog}
              </pre>
            </div>
          ) : (
            <button
              onClick={handleInstallDocker}
              className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
            >
              Cài đặt Docker tự động
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub tabs */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => {
                setDockerSubTab('containers')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'containers' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Containers ({containers.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('images')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'images' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Images ({images.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('compose')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'compose' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Compose ({composeProjects.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('networks')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'networks' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Networks ({networks.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('volumes')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'volumes' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Volumes ({volumes.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('config')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'config' ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              Config
            </button>
          </div>

          {dockerSubTab === 'containers' && (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="p-3">Container ID</th>
                    <th className="p-3">Tên</th>
                    <th className="p-3">Image</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3">CPU / RAM</th>
                    <th className="p-3">Cổng (Ports)</th>
                    <th className="p-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c) => (
                    <tr key={c.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="p-3 font-mono text-[#6c7086]">{c.id}</td>
                      <td className="p-3 font-bold text-[#cdd6f4]">{c.name}</td>
                      <td className="p-3 font-mono text-[#a6adc8] max-w-[150px] truncate" title={c.image}>
                        {c.image}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                            c.status.toLowerCase().includes('up') ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[#a6adc8] text-[11px]">
                        {c.status.toLowerCase().includes('up') && containerStats[c.name] ? (
                          <span>
                            {containerStats[c.name].cpu} / {containerStats[c.name].mem}
                          </span>
                        ) : (
                          <span className="text-[#585b70]">-</span>
                        )}
                      </td>
                      <td className="p-3 font-mono">
                        {c.ports && c.ports !== '-' ? (
                          <div className="flex flex-wrap gap-1">
                            {c.ports.split(',').map((p, idx) => (
                              <span
                                key={idx}
                                className="bg-[#89b4fa]/10 text-[#89b4fa] px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                title={p.trim()}
                              >
                                {p.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#585b70]">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5 justify-center">
                          {c.status.toLowerCase().includes('up') ? (
                            <button
                              onClick={() => handleDockerContainerAction('stop', c.id)}
                              className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                              title="Stop Container"
                            >
                              <Square size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDockerContainerAction('start', c.id)}
                              className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                              title="Start Container"
                            >
                              <Play size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDockerContainerAction('restart', c.id)}
                            className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                            title="Restart Container"
                          >
                            <RefreshCw size={12} />
                          </button>
                          <button
                            onClick={() => handleViewDockerContainerLogs(c.id, c.name)}
                            className="p-1 rounded hover:bg-white/5 text-[#fab387]"
                            title="View Container Logs"
                          >
                            <FileText size={12} />
                          </button>
                          <button
                            onClick={() => handleDockerContainerAction('rm', c.id)}
                            className="p-1 rounded hover:bg-white/5 text-[#f38ba8]/70 hover:text-[#f38ba8]"
                            title="Remove Container"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dockerSubTab === 'images' && (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="p-3">Repository</th>
                    <th className="p-3">Tag</th>
                    <th className="p-3">Image ID</th>
                    <th className="p-3">Size</th>
                    <th className="p-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((img, idx) => (
                    <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="p-3 font-bold text-[#cdd6f4]">{img.repository}</td>
                      <td className="p-3 text-[#a6adc8]">{img.tag}</td>
                      <td className="p-3 font-mono text-[#6c7086]">{img.id}</td>
                      <td className="p-3 font-mono text-[#6c7086]">{img.size}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDockerImageAction('rmi', img.id)}
                          className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                          title="Remove Image"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dockerSubTab === 'config' && (
            <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#cdd6f4]">Cấu hình Docker Daemon (/etc/docker/daemon.json)</span>
                  <span className="text-[10px] text-[#585b70]">Định dạng tệp tin cấu hình là JSON. Chú ý kiểm tra cú pháp trước khi lưu.</span>
                </div>
                <button
                  onClick={handleSaveDaemonConfig}
                  disabled={savingConfig}
                  className="px-3.5 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all disabled:opacity-40"
                >
                  {savingConfig ? 'Đang lưu...' : 'Lưu & Khởi động lại Docker'}
                </button>
              </div>
              <textarea
                value={daemonConfig}
                onChange={(e) => setDaemonConfig(e.target.value)}
                spellCheck={false}
                className="flex-1 w-full bg-[#11111b] border border-white/5 rounded-xl p-4 text-xs font-mono text-[#cdd6f4] outline-none resize-none leading-relaxed"
                placeholder="{\n  ...\n}"
              />
            </div>
          )}

          {dockerSubTab === 'compose' && (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              {composeProjects.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[#585b70] text-xs py-12">Không tìm thấy Docker Compose project nào.</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                      <th className="p-3">Project</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Config Files</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composeProjects.map((p, idx) => (
                      <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                        <td className="p-3 font-bold text-[#cdd6f4]">{p.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${p.status.includes('running') ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[#6c7086] text-[10px] truncate max-w-[200px]" title={p.configFiles}>{p.configFiles}</td>
                        <td className="p-3">
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={async () => { setLoading(true); await exec(`docker compose -p ${p.name} up -d 2>/dev/null`); await fetchDocker(); setLoading(false) }}
                              className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]" title="Up"
                            ><Play size={12} /></button>
                            <button
                              onClick={async () => { setLoading(true); await exec(`docker compose -p ${p.name} stop 2>/dev/null`); await fetchDocker(); setLoading(false) }}
                              className="p-1 rounded hover:bg-white/5 text-[#f38ba8]" title="Stop"
                            ><Square size={12} /></button>
                            <button
                              onClick={async () => { setLoading(true); await exec(`docker compose -p ${p.name} restart 2>/dev/null`); await fetchDocker(); setLoading(false) }}
                              className="p-1 rounded hover:bg-white/5 text-[#89b4fa]" title="Restart"
                            ><RefreshCw size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {dockerSubTab === 'networks' && (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="p-3">Network ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Driver</th>
                    <th className="p-3">Scope</th>
                    <th className="p-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {networks.map((n, idx) => (
                    <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="p-3 font-mono text-[#6c7086]">{n.id.substring(0, 12)}</td>
                      <td className="p-3 font-bold text-[#cdd6f4]">{n.name}</td>
                      <td className="p-3 text-[#a6adc8]">{n.driver}</td>
                      <td className="p-3 text-[#585b70]">{n.scope}</td>
                      <td className="p-3 text-center">
                        {!['bridge', 'host', 'none'].includes(n.name) && (
                          <button
                            onClick={async () => { if (confirm(`Xóa network ${n.name}?`)) { setLoading(true); await exec(`docker network rm ${n.id}`); await fetchDocker(); setLoading(false) }}}
                            className="p-1 rounded hover:bg-white/5 text-[#f38ba8]" title="Remove"
                          ><Trash2 size={12} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dockerSubTab === 'volumes' && (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin">
              <div className="flex justify-end p-2">
                <button
                  onClick={async () => { if (confirm('Xóa tất cả volumes không sử dụng?')) { setLoading(true); await exec('docker volume prune -f'); await fetchDocker(); setLoading(false) }}}
                  className="px-2 py-1 rounded bg-[#f38ba8]/10 text-[#f38ba8] text-[10px] font-semibold hover:bg-[#f38ba8]/20"
                >
                  Prune Unused
                </button>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Driver</th>
                    <th className="p-3">Mountpoint</th>
                    <th className="p-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {volumes.map((v, idx) => (
                    <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="p-3 font-bold text-[#cdd6f4] truncate max-w-[200px]" title={v.name}>{v.name}</td>
                      <td className="p-3 text-[#a6adc8]">{v.driver}</td>
                      <td className="p-3 font-mono text-[#6c7086] text-[10px] truncate max-w-[200px]" title={v.mountpoint}>{v.mountpoint}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={async () => { if (confirm(`Xóa volume ${v.name}?`)) { setLoading(true); await exec(`docker volume rm ${v.name}`); await fetchDocker(); setLoading(false) }}}
                          className="p-1 rounded hover:bg-white/5 text-[#f38ba8]" title="Remove"
                        ><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Log Modal for Docker Containers */}
      {selectedContainerLogs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedContainerLogs(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-gradient-to-r from-[#181825] to-transparent">
              <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
                Docker Logs: {selectedContainerLogs.name}
              </h3>
              <button onClick={() => setSelectedContainerLogs(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={15} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text selection:bg-[#89b4fa]/25 scrollbar-thin">
              {selectedContainerLogs.logs}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
