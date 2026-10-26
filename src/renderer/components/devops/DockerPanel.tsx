import { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Square, Play, RefreshCw, FileText, Trash2, X, Terminal, Plus, Edit3, FileCode, ArrowLeft } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'

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

  // Docker Compose Editor states
  const [selectedComposeProject, setSelectedComposeProject] = useState<{ name: string; configFiles: string } | null>(null)
  const [composeConfigContent, setComposeConfigContent] = useState('')
  const [savingCompose, setSavingCompose] = useState(false)
  const [showCreateComposeModal, setShowCreateComposeModal] = useState(false)
  const [newComposeName, setNewComposeName] = useState('')
  const [newComposeDir, setNewComposeDir] = useState('/var/www')
  const [creatingCompose, setCreatingCompose] = useState(false)
  const [showComposePicker, setShowComposePicker] = useState(false)

  // New states for compose, networks, volumes
  const [composeProjects, setComposeProjects] = useState<{ name: string; status: string; configFiles: string }[]>([])
  const [networks, setNetworks] = useState<{ id: string; name: string; driver: string; scope: string }[]>([])
  const [volumes, setVolumes] = useState<{ name: string; driver: string; mountpoint: string }[]>([])
  const [containerStats, setContainerStats] = useState<Record<string, { cpu: string; mem: string }>>({})

  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')
  const [daemonConfig, setDaemonConfig] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Docker Registry & Image Pull states
  const [pullImageName, setPullImageName] = useState('')
  const [pullingImage, setPullingImage] = useState(false)
  const [registryHost, setRegistryHost] = useState('')
  const [registryUser, setRegistryUser] = useState('')
  const [registryPass, setRegistryPass] = useState('')
  const [loggingInRegistry, setLoggingInRegistry] = useState(false)
  const [registryLogs, setRegistryLogs] = useState('')

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

  const handleDockerPull = async () => {
    if (!pullImageName.trim()) {
      alert('Vui lòng nhập tên Image!')
      return
    }
    setPullingImage(true)
    setRegistryLogs(`Đang thực hiện pull image: ${pullImageName.trim()}...\n`)
    try {
      const res = await exec(`docker pull "${pullImageName.trim()}"`)
      setRegistryLogs((prev) => prev + res.stdout + '\n' + res.stderr + '\n')
      if (res.code === 0) {
        setRegistryLogs((prev) => prev + '✅ Pull image thành công!\n')
        alert('Tải Docker Image thành công!')
        setPullImageName('')
        await fetchDocker()
      } else {
        throw new Error(res.stderr || 'Pull image thất bại')
      }
    } catch (err: any) {
      setRegistryLogs((prev) => prev + `❌ Lỗi: ${err.message}\n`)
      alert('Lỗi pull image: ' + err.message)
    } finally {
      setPullingImage(false)
    }
  }

  const handleDockerLogin = async () => {
    if (!registryUser.trim() || !registryPass.trim()) {
      alert('Vui lòng nhập Username và Password!')
      return
    }
    setLoggingInRegistry(true)
    setRegistryLogs('Bắt đầu đăng nhập registry...\n')
    try {
      const hostArg = registryHost.trim() ? `"${registryHost.trim()}"` : ''
      // base64 so special characters in the password are not interpreted by the shell.
      const bytes = new TextEncoder().encode(registryPass.trim())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const passB64 = btoa(binary)
      const cmd = `echo '${passB64}' | base64 -d | docker login ${hostArg} -u "${registryUser.trim()}" --password-stdin`
      const res = await exec(cmd)
      setRegistryLogs((prev) => prev + res.stdout + '\n' + res.stderr + '\n')
      if (res.code === 0) {
        setRegistryLogs((prev) => prev + '✅ Đăng nhập Registry thành công!\n')
        alert('Đăng nhập Registry thành công!')
      } else {
        throw new Error(res.stderr || 'Đăng nhập thất bại')
      }
    } catch (err: any) {
      setRegistryLogs((prev) => prev + `❌ Lỗi: ${err.message}\n`)
      alert('Lỗi đăng nhập: ' + err.message)
    } finally {
      setLoggingInRegistry(false)
    }
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

  const handleDockerContainerTerminal = async (containerName: string) => {
    const tabsStore = useTerminalStore.getState()
    const currentTab = tabsStore.tabs.find((t) => t.sessionId === sessionId)
    if (!currentTab || !currentTab.config) {
      alert('Không tìm thấy cấu hình kết nối SSH hiện tại.')
      return
    }

    const execSessionId = `conn-docker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    
    tabsStore.addTab({
      sessionId: execSessionId,
      hostId: currentTab.hostId,
      label: `Exec: ${containerName}`,
      connected: false,
      loading: true,
      config: currentTab.config,
      startupCommand: `docker exec -it "${containerName}" /bin/bash || docker exec -it "${containerName}" /bin/sh || docker exec -it "${containerName}" sh`,
      viewMode: 'terminal'
    })

    const result = await window.api.ssh.connect(execSessionId ? { ...currentTab.config, sessionId: execSessionId } : currentTab.config)
    tabsStore.updateTabState(execSessionId, {
      connected: !result.error,
      loading: false,
      label: result.error ? `Exec: ${containerName} (error)` : `Exec: ${containerName}`
    })
  }

  const handleReadComposeFile = async (name: string, configFiles: string) => {
    setLoading(true)
    setError('')
    try {
      const { stdout, code, stderr } = await exec(`cat "${configFiles}"`)
      if (code !== 0) {
        throw new Error(stderr || 'Không thể đọc file compose.')
      }
      setSelectedComposeProject({ name, configFiles })
      setComposeConfigContent(stdout)
    } catch (err: any) {
      alert('Lỗi đọc file: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveComposeConfig = async () => {
    if (!selectedComposeProject || savingCompose) return
    setSavingCompose(true)
    try {
      const writeCmd = `cat << 'EOF' > "${selectedComposeProject.configFiles}"\n${composeConfigContent}\nEOF`
      const res = await exec(writeCmd)
      if (res.code !== 0) {
        throw new Error(res.stderr || 'Không thể lưu file compose.')
      }
      alert('Đã lưu file compose thành công!')
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setSavingCompose(false)
    }
  }

  const handleCreateComposeProject = async () => {
    if (!newComposeName.trim() || !newComposeDir.trim()) {
      alert('Vui lòng nhập tên project và thư mục!')
      return
    }
    setCreatingCompose(true)
    try {
      const dir = newComposeDir.trim()
      const name = newComposeName.trim()
      const filePath = `${dir}/docker-compose.yml`
      const template = `version: '3.8'
services:
  ${name}:
    image: nginx:alpine
    container_name: ${name}
    ports:
      - "8080:80"
    restart: always`

      const initCmd = `mkdir -p "${dir}" && cat << 'EOF' > "${filePath}"\n${template}\nEOF`
      const res = await exec(initCmd)
      if (res.code !== 0) {
        throw new Error(res.stderr || 'Không thể khởi tạo thư mục và tệp compose.')
      }

      setLoading(true)
      const upRes = await exec(`cd "${dir}" && docker compose up -d`)
      setLoading(false)
      if (upRes.code !== 0) {
        alert('Tạo file thành công nhưng docker compose up thất bại: ' + upRes.stderr)
      } else {
        alert('Đã tạo và khởi chạy Docker Compose project thành công!')
      }

      setShowCreateComposeModal(false)
      setNewComposeName('')
      await fetchDocker()
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setCreatingCompose(false)
    }
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
            {dockerSubTab === 'compose' && !selectedComposeProject && (
              <button
                onClick={() => setShowCreateComposeModal(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold uppercase bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 active:scale-95 transition-all"
              >
                <Plus size={11} /> Thêm Project mới
              </button>
            )}
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
                          {c.status.toLowerCase().includes('up') && (
                            <button
                              onClick={() => handleDockerContainerTerminal(c.name)}
                              className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                              title="Interactive Terminal"
                            >
                              <Terminal size={12} />
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
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
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

              {/* Side-by-side Pull & Login forms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                {/* Pull Image form */}
                <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider">Tải Docker Image mới (Pull)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ví dụ: nginx:alpine, redis:latest..."
                      value={pullImageName}
                      onChange={(e) => setPullImageName(e.target.value)}
                      className="flex-1 bg-[#11111b] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      disabled={pullingImage}
                    />
                    <button
                      onClick={handleDockerPull}
                      disabled={pullingImage}
                      className="px-4 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec]"
                    >
                      {pullingImage ? 'Pulling...' : 'Tải về'}
                    </button>
                  </div>
                </div>

                {/* Docker Login form */}
                <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-[10px] uppercase font-bold text-[#585b70] tracking-wider">Đăng nhập Docker Registry</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Registry Host (để trống nếu là DockerHub)"
                      value={registryHost}
                      onChange={(e) => setRegistryHost(e.target.value)}
                      className="flex-1 min-w-[150px] bg-[#11111b] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      disabled={loggingInRegistry}
                    />
                    <input
                      type="text"
                      placeholder="Username"
                      value={registryUser}
                      onChange={(e) => setRegistryUser(e.target.value)}
                      className="w-28 bg-[#11111b] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      disabled={loggingInRegistry}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={registryPass}
                      onChange={(e) => setRegistryPass(e.target.value)}
                      className="w-28 bg-[#11111b] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none font-mono select-text"
                      disabled={loggingInRegistry}
                    />
                    <button
                      onClick={handleDockerLogin}
                      disabled={loggingInRegistry}
                      className="px-4 py-1.5 rounded-lg bg-[#a6e3a1] text-[#1e1e2e] text-xs font-bold hover:bg-[#86c581]"
                    >
                      {loggingInRegistry ? 'Logging in...' : 'Login'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Logs Console for Pull / Login actions */}
              {registryLogs && (
                <div className="h-32 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-3 shrink-0">
                  <div className="flex justify-between items-center mb-1 shrink-0">
                    <span className="text-[9px] uppercase font-bold text-[#585b70] tracking-wider">Trạng thái Tiến trình Registry</span>
                    <button
                      onClick={() => setRegistryLogs('')}
                      className="text-[9px] text-[#f38ba8] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <pre className="flex-1 overflow-y-auto font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap select-text bg-[#11111b] p-2.5 rounded-lg border border-white/[0.02] scrollbar-thin">
                    {registryLogs}
                  </pre>
                </div>
              )}
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
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl scrollbar-thin flex flex-col">
              {selectedComposeProject ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedComposeProject(null)}
                        className="p-1 hover:bg-white/5 rounded text-[#a6adc8] hover:text-[#cdd6f4]"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span className="font-mono text-xs text-[#a6adc8]">
                        {selectedComposeProject.name} ({selectedComposeProject.configFiles})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveComposeConfig}
                        disabled={savingCompose}
                        className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] text-xs font-semibold hover:bg-[#74c7ec] active:scale-95 disabled:opacity-40 transition-all"
                      >
                        {savingCompose ? 'Đang Lưu...' : 'Lưu File'}
                      </button>
                      <button
                        onClick={async () => {
                          await handleSaveComposeConfig()
                          setLoading(true)
                          const parentDir = selectedComposeProject.configFiles.substring(0, selectedComposeProject.configFiles.lastIndexOf('/'))
                          const res = await exec(`cd "${parentDir}" && docker compose up -d`)
                          setLoading(false)
                          if (res.code === 0) {
                            alert('Đã chạy docker compose up -d thành công!')
                            await fetchDocker()
                          } else {
                            alert('Lỗi: ' + res.stderr)
                          }
                        }}
                        className="px-3 py-1 rounded bg-[#a6e3a1] text-[#1e1e2e] text-xs font-semibold hover:bg-[#86c581] active:scale-95 transition-all"
                      >
                        Lưu & Up
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm('Chạy docker compose down cho project này?')) {
                            setLoading(true)
                            const parentDir = selectedComposeProject.configFiles.substring(0, selectedComposeProject.configFiles.lastIndexOf('/'))
                            const res = await exec(`cd "${parentDir}" && docker compose down`)
                            setLoading(false)
                            if (res.code === 0) {
                              alert('Đã chạy docker compose down thành công!')
                              await fetchDocker()
                            } else {
                              alert('Lỗi: ' + res.stderr)
                            }
                          }
                        }}
                        className="px-3 py-1 rounded bg-[#f38ba8] text-[#1e1e2e] text-xs font-semibold hover:bg-[#e27a97] active:scale-95 transition-all"
                      >
                        Down Project
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={composeConfigContent}
                    onChange={(e) => setComposeConfigContent(e.target.value)}
                    className="flex-1 p-4 bg-[#181825] text-xs text-[#cdd6f4] outline-none font-mono resize-none leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              ) : composeProjects.length === 0 ? (
                <div className="flex-grow flex items-center justify-center text-[#585b70] text-xs py-12">Không tìm thấy Docker Compose project nào.</div>
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
                              onClick={() => handleReadComposeFile(p.name, p.configFiles)}
                              className="p-1 rounded hover:bg-white/5 text-[#fab387]"
                              title="Edit Compose File"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={async () => { setLoading(true); const parentDir = p.configFiles.substring(0, p.configFiles.lastIndexOf('/')); await exec(`cd "${parentDir}" && docker compose up -d`); await fetchDocker(); setLoading(false) }}
                              className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]" title="Up"
                            ><Play size={12} /></button>
                            <button
                              onClick={async () => { setLoading(true); const parentDir = p.configFiles.substring(0, p.configFiles.lastIndexOf('/')); await exec(`cd "${parentDir}" && docker compose stop`); await fetchDocker(); setLoading(false) }}
                              className="p-1 rounded hover:bg-white/5 text-[#f38ba8]" title="Stop"
                            ><Square size={12} /></button>
                            <button
                              onClick={async () => { setLoading(true); const parentDir = p.configFiles.substring(0, p.configFiles.lastIndexOf('/')); await exec(`cd "${parentDir}" && docker compose restart`); await fetchDocker(); setLoading(false) }}
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

      {/* Create Compose Modal */}
      {showCreateComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateComposeModal(false)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Tạo Docker Compose Project mới
              </h3>
              <button onClick={() => setShowCreateComposeModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên dịch vụ/Project (Project Name) *</label>
                <input
                  type="text"
                  placeholder="ví dụ: my-web-app"
                  value={newComposeName}
                  onChange={(e) => setNewComposeName(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Thư mục lưu trữ (Directory Path) *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="/var/www/my-web-app"
                    value={newComposeDir}
                    onChange={(e) => setNewComposeDir(e.target.value)}
                    className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowComposePicker(true)}
                    className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs flex items-center justify-center"
                  >
                    Duyệt...
                  </button>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateComposeModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateComposeProject}
                  disabled={creatingCompose}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {creatingCompose ? 'Đang tạo...' : 'Tạo & Up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showComposePicker && (
        <RemotePathPicker
          visible={true}
          mode="dir"
          exec={exec}
          onClose={() => setShowComposePicker(false)}
          onSelect={(path) => setNewComposeDir(path)}
        />
      )}
    </div>
  )
}

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
