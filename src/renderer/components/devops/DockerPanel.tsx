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
  const [dockerSubTab, setDockerSubTab] = useState<'containers' | 'images'>('containers')
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [images, setImages] = useState<DockerImage[]>([])
  const [selectedContainerLogs, setSelectedContainerLogs] = useState<{ id: string; name: string; logs: string } | null>(null)

  const fetchDocker = useCallback(async () => {
    try {
      const checkDocker = await exec('docker --version 2>/dev/null')
      if (checkDocker.code !== 0) {
        setDockerInstalled(false)
        return
      }
      setDockerInstalled(true)

      if (dockerSubTab === 'containers') {
        const { stdout } = await exec(`docker ps -a --format '{{.ID}}||{{.Names}}||{{.Image}}||{{.Status}}||{{.Ports}}' 2>/dev/null`)
        const list = stdout
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
      } else {
        const { stdout } = await exec(`docker images --format '{{.Repository}}||{{.Tag}}||{{.ID}}||{{.Size}}' 2>/dev/null`)
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

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchDocker()
    setLoading(false)
  }, [fetchDocker, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const interval = setInterval(fetchDocker, 5000)
    return () => clearInterval(interval)
  }, [fetchDocker])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!dockerInstalled ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
          <Box size={36} className="mb-3 opacity-30" />
          <span className="text-xs font-semibold">Docker không được cài đặt hoặc chưa khởi động</span>
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
                dockerSubTab === 'containers' ? 'bg-accent-blue/15 text-accent-blue' : 'text-surface-mid hover:text-surface-light'
              }`}
            >
              Containers ({containers.length})
            </button>
            <button
              onClick={() => {
                setDockerSubTab('images')
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                dockerSubTab === 'images' ? 'bg-accent-blue/15 text-accent-blue' : 'text-surface-mid hover:text-surface-light'
              }`}
            >
              Images ({images.length})
            </button>
          </div>

          {dockerSubTab === 'containers' ? (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                    <th className="p-3">Container ID</th>
                    <th className="p-3">Tên</th>
                    <th className="p-3">Image</th>
                    <th className="p-3">Trạng Thái</th>
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
          ) : (
            <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
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
