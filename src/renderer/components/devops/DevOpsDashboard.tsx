import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Layers,
  Settings,
  FolderOpen,
  RefreshCw,
  Play,
  Square,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  FileCode,
  HardDrive,
  Box,
  Database,
  Terminal,
  Trash2,
  Plus,
  ArrowRight,
  Server
} from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'
import SftpPanel from '../sftp/SftpPanel'
import TunnelPanel from '../tunnel/TunnelPanel'

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

interface DevOpsDashboardProps {
  sessionId: string
}

interface SysInfo {
  [key: string]: any
  os?: string
  uptime?: string
  load?: string
  mem_total?: number
  mem_used?: number
  mem_free?: number
  mem_avail?: number
  swap_total?: number
  swap_used?: number
  disk_total?: number
  disk_used?: number
  disk_free?: number
  disk_percent?: number
  cpu_used?: number
  cpu_cores?: number
  cpu_model?: string
  local_ip?: string
  public_ip?: string
}

interface PM2App {
  name: string
  pm_id: number
  pid: number
  status: string
  cpu: number
  memory: number // MB
  restarts: number
  outLog?: string
  errLog?: string
}

interface SystemService {
  name: string
  activeState: string
  subState: string
  description: string
  pid?: string
}

interface ListeningPort {
  proto: string
  address: string
  port: string
  processName: string
  pid: string
}

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

interface DbInstance {
  type: 'mysql' | 'postgres' | 'redis' | 'mongodb' | 'unknown'
  port: string
  address: string
  processName: string
  pid: string
}

interface ActiveTunnel {
  id: string
  listenPort: number
  targetPort: number
  active: boolean
}

export default function DevOpsDashboard({ sessionId }: DevOpsDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'pm2' | 'services' | 'nginx' | 'docker' | 'logs' | 'database' | 'sftp' | 'tunnel'>('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const updateTabState = useTerminalStore((s) => s.updateTabState)

  // Overview states
  const [sysInfo, setSysInfo] = useState<SysInfo | null>(null)
  const [ports, setPorts] = useState<ListeningPort[]>([])

  // PM2 states
  const [pm2Apps, setPm2Apps] = useState<PM2App[]>([])
  const [pm2Installed, setPm2Installed] = useState(true)
  const [selectedAppLogs, setSelectedAppLogs] = useState<{ name: string; logs: string } | null>(null)

  // Services states
  const [services, setServices] = useState<SystemService[]>([])

  // Nginx states
  const [nginxFiles, setNginxFiles] = useState<string[]>([])
  const [selectedNginxFile, setSelectedNginxFile] = useState<string | null>(null)
  const [nginxConfigContent, setNginxConfigContent] = useState('')
  const [nginxTestResult, setNginxTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savingNginx, setSavingNginx] = useState(false)

  // Docker states
  const [dockerInstalled, setDockerInstalled] = useState(true)
  const [dockerSubTab, setDockerSubTab] = useState<'containers' | 'images'>('containers')
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [images, setImages] = useState<DockerImage[]>([])
  const [selectedContainerLogs, setSelectedContainerLogs] = useState<{ id: string; name: string; logs: string } | null>(null)

  // Log Streamer states
  const [logPaths, setLogPaths] = useState<string[]>([
    '/var/log/nginx/access.log',
    '/var/log/nginx/error.log',
    '/var/log/syslog'
  ])
  const [selectedLogPath, setSelectedLogPath] = useState<string>('/var/log/nginx/access.log')
  const [logContent, setLogContent] = useState<string>('')
  const [logSearch, setLogSearch] = useState<string>('')
  const [logAutoRefresh, setLogAutoRefresh] = useState<boolean>(true)
  const [newLogPathInput, setNewLogPathInput] = useState<string>('')
  const [showAddLogInput, setShowAddLogInput] = useState<boolean>(false)

  // Database Tunnel states
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([])
  const [activeTunnels, setActiveTunnels] = useState<ActiveTunnel[]>([])
  const [showCreateTunnelModal, setShowCreateTunnelModal] = useState<{ dbPort: string; dbType: string } | null>(null)
  const [tunnelLocalPortInput, setTunnelLocalPortInput] = useState<string>('')
  const [tunnelNameInput, setTunnelNameInput] = useState<string>('')

  // Common exec helper
  const exec = useCallback(async (cmd: string) => {
    try {
      const result = await window.api.ssh.exec(sessionId, cmd)
      return result
    } catch (err: any) {
      return { stdout: '', stderr: err.message || 'Execution failed', code: -1 }
    }
  }, [sessionId])

  // Fetch ports list helper
  const fetchPortsList = useCallback(async (): Promise<ListeningPort[]> => {
    const cmd = `sudo ss -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true`
    const { stdout } = await exec(cmd)
    if (!stdout) return []

    const portLines = stdout.split('\n')
    const parsedPorts: ListeningPort[] = []
    portLines.forEach(l => {
      const line = l.replace(/\s+/g, ' ').trim()
      if (!line || line.startsWith('Netid') || line.startsWith('Active') || line.startsWith('Proto')) return

      const tokens = line.split(' ')
      if (tokens.length < 4) return

      const proto = tokens[0]
      let localAddressPort = ''
      let processInfo = ''

      if (line.includes('LISTEN') || tokens.includes('LISTEN') || tokens[1] === 'LISTEN') {
        if (line.includes('users:')) {
          localAddressPort = tokens[4]
          processInfo = tokens.slice(6).join(' ')
        } else {
          localAddressPort = tokens[3]
          processInfo = tokens[tokens.length - 1]
        }

        if (localAddressPort) {
          const lastColonIdx = localAddressPort.lastIndexOf(':')
          if (lastColonIdx !== -1) {
            const address = localAddressPort.substring(0, lastColonIdx)
            const port = localAddressPort.substring(lastColonIdx + 1)
            
            let processName = '-'
            let pid = '-'
            if (processInfo.includes('users:')) {
              const match = processInfo.match(/users:\(\("([^"]+)",(?:pid|pgid)=(\d+)/)
              if (match) {
                processName = match[1]
                pid = match[2]
              }
            } else if (processInfo.includes('/')) {
              const match = processInfo.match(/(\d+)\/(.+)/)
              if (match) {
                pid = match[1]
                processName = match[2]
              }
            } else {
              processName = processInfo
            }

            parsedPorts.push({
              proto: proto.toUpperCase(),
              address,
              port,
              processName,
              pid
            })
          }
        }
      }
    })
    return parsedPorts
  }, [exec])

  // Fetch Overview metrics
  const fetchOverview = useCallback(async () => {
    const portsList = await fetchPortsList()
    setPorts(portsList)

    const script = `
      os=$(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2 2>/dev/null || echo "Linux")
      uptime_str=$(uptime -p 2>/dev/null || echo "Unknown Uptime")
      load_avg=$(uptime | awk -F'load average:' '{ print $2 }' | xargs 2>/dev/null || echo "0, 0, 0")
      cpu_cores=$(nproc 2>/dev/null || echo "1")
      cpu_model=$(cat /proc/cpuinfo | grep 'model name' | head -n 1 | cut -d':' -f2 | xargs 2>/dev/null || echo "Generic CPU")
      mem_total=$(free -m 2>/dev/null | awk '/Mem:/ {print $2}' || echo 0)
      mem_used=$(free -m 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
      mem_free=$(free -m 2>/dev/null | awk '/Mem:/ {print $4}' || echo 0)
      mem_avail=$(free -m 2>/dev/null | awk '/Mem:/ {print $7}' || echo 0)
      swap_total=$(free -m 2>/dev/null | awk '/Swap:/ {print $2}' || echo 0)
      swap_used=$(free -m 2>/dev/null | awk '/Swap:/ {print $3}' || echo 0)
      disk_total=$(df -BM / | awk 'NR==2 {print $2}' | sed 's/M//' 2>/dev/null || echo 0)
      disk_used=$(df -BM / | awk 'NR==2 {print $3}' | sed 's/M//' 2>/dev/null || echo 0)
      disk_free=$(df -BM / | awk 'NR==2 {print $4}' | sed 's/M//' 2>/dev/null || echo 0)
      disk_percent=$(df -m / | awk 'NR==2 {print $5}' | sed 's/%//' 2>/dev/null || echo 0)
      cpu_idle=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' 2>/dev/null || echo 100)
      cpu_used=$(echo "100 - $cpu_idle" | bc 2>/dev/null || awk "BEGIN {print 100 - $cpu_idle}" 2>/dev/null || echo 0)
      local_ip=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "127.0.0.1")
      public_ip=$(curl -s --connect-timeout 1 ifconfig.me 2>/dev/null || echo "Unknown")

      echo "os: $os"
      echo "uptime: $uptime_str"
      echo "load: $load_avg"
      echo "cpu_cores: $cpu_cores"
      echo "cpu_model: $cpu_model"
      echo "mem_total: $mem_total"
      echo "mem_used: $mem_used"
      echo "mem_free: $mem_free"
      echo "mem_avail: $mem_avail"
      echo "swap_total: $swap_total"
      echo "swap_used: $swap_used"
      echo "disk_total: $disk_total"
      echo "disk_used: $disk_used"
      echo "disk_free: $disk_free"
      echo "disk_percent: $disk_percent"
      echo "cpu_used: $cpu_used"
      echo "local_ip: $local_ip"
      echo "public_ip: $public_ip"
    `
    const { stdout } = await exec(script)
    if (!stdout) return

    const lines = stdout.split('\n')
    const info: SysInfo = {}
    lines.forEach((l) => {
      const lineParts = l.split(': ')
      if (lineParts.length >= 2) {
        const key = lineParts[0].trim()
        const value = lineParts.slice(1).join(': ').trim()
        if (['mem_total', 'mem_used', 'mem_free', 'mem_avail', 'swap_total', 'swap_used', 'disk_total', 'disk_used', 'disk_free', 'disk_percent', 'cpu_used', 'cpu_cores'].includes(key)) {
          info[key] = parseFloat(value) || 0
        } else {
          info[key] = value
        }
      }
    })
    setSysInfo(info)

    // Resource Alerts check
    const cpuUsed = info.cpu_used || 0
    const memTotal = info.mem_total || 1
    const memUsed = info.mem_used || 0
    const memPercent = (memUsed / memTotal) * 100
    const diskPercent = info.disk_percent || 0

    if (cpuUsed > 85 || memPercent > 90 || diskPercent > 95) {
      updateTabState(sessionId, { alertStatus: 'danger' })
    } else {
      updateTabState(sessionId, { alertStatus: 'normal' })
    }
  }, [exec, fetchPortsList, sessionId, updateTabState])

  // Fetch PM2 metrics
  const fetchPm2 = useCallback(async () => {
    const portsList = await fetchPortsList()
    setPorts(portsList)

    const { stdout, code } = await exec('pm2 jlist 2>/dev/null')
    if (code !== 0 || !stdout) {
      setPm2Installed(false)
      setPm2Apps([])
      return
    }
    setPm2Installed(true)
    try {
      const data = JSON.parse(stdout)
      const apps = data.map((app: any) => ({
        name: app.name || 'Unnamed',
        pm_id: app.pm_id ?? 0,
        pid: app.pid ?? 0,
        status: app.pm2_env?.status || 'unknown',
        cpu: app.monit?.cpu ?? 0,
        memory: Math.round((app.monit?.memory ?? 0) / (1024 * 1024)),
        restarts: app.pm2_env?.restart_time ?? 0,
        outLog: app.pm2_env?.pm_out_log_path,
        errLog: app.pm2_env?.pm_err_log_path
      }))
      setPm2Apps(apps)
    } catch {
      setPm2Installed(false)
    }
  }, [exec, fetchPortsList])

  // Fetch Services status
  const fetchServices = useCallback(async () => {
    const portsList = await fetchPortsList()
    setPorts(portsList)

    const cmd = `
      systemctl list-units --type=service --all --no-pager 2>/dev/null | grep -E "nginx|mysql|postgresql|docker|redis|apache2|mongodb|pm2|ssh" || true
      echo "===PIDS==="
      systemctl show --property=MainPID,Id nginx mysql postgresql redis docker apache2 mongodb ssh 2>/dev/null || true
    `
    const { stdout } = await exec(cmd)
    const parts = stdout.split('===PIDS===')
    const listPart = parts[0] || ''
    const pidsPart = parts[1] || ''

    // Parse MainPIDs
    const servicePids: Record<string, string> = {}
    let currentId = ''
    pidsPart.split('\n').forEach(l => {
      const line = l.trim()
      if (line.startsWith('Id=')) {
        currentId = line.replace('Id=', '').replace('.service', '')
      } else if (line.startsWith('MainPID=') && currentId) {
        const pid = line.replace('MainPID=', '')
        if (pid && pid !== '0') {
          servicePids[currentId] = pid
        }
      }
    })

    const lines = listPart.split('\n')
    const serviceList: SystemService[] = []
    lines.forEach((l) => {
      const cleaned = l.replace(/\s+/g, ' ').trim()
      const parts = cleaned.split(' ')
      if (parts.length >= 4 && parts[0].endsWith('.service')) {
        const name = parts[0].replace('.service', '')
        const activeState = parts[2]
        const subState = parts[3]
        const description = parts.slice(4).join(' ')
        const pid = servicePids[name] || ''
        serviceList.push({ name, activeState, subState, description, pid })
      }
    })
    setServices(serviceList)
  }, [exec, fetchPortsList])

  // Fetch Nginx hosts
  const fetchNginx = useCallback(async () => {
    const { stdout } = await exec('ls -1 /etc/nginx/sites-available/ 2>/dev/null || ls -1 /etc/nginx/conf.d/ 2>/dev/null')
    if (stdout) {
      const files = stdout.split('\n').map(f => f.trim()).filter(Boolean)
      setNginxFiles(files)
    } else {
      setNginxFiles([])
    }
  }, [exec])

  // Fetch Docker details
  const fetchDocker = useCallback(async () => {
    const checkDocker = await exec('docker --version 2>/dev/null')
    if (checkDocker.code !== 0) {
      setDockerInstalled(false)
      return
    }
    setDockerInstalled(true)

    if (dockerSubTab === 'containers') {
      const { stdout } = await exec(`docker ps -a --format '{{.ID}}||{{.Names}}||{{.Image}}||{{.Status}}||{{.Ports}}' 2>/dev/null`)
      const list = stdout.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
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
      const list = stdout.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
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
  }, [exec, dockerSubTab])

  // Fetch log streamer content
  const fetchLogsContent = useCallback(async () => {
    if (!selectedLogPath) return
    const { stdout, stderr } = await exec(`tail -n 100 "${selectedLogPath}" 2>&1`)
    setLogContent(stripAnsi(stdout || stderr || 'Không tìm thấy log hoặc file trống.'))
  }, [exec, selectedLogPath])

  // Fetch active tunnels
  const fetchTunnels = useCallback(async () => {
    try {
      const list = await window.api.tunnel.list()
      const filtered = list.map((t: any) => ({
        id: t.id,
        listenPort: t.listenPort,
        targetPort: t.targetPort,
        active: t.active
      }))
      setActiveTunnels(filtered)
    } catch {}
  }, [])

  // Fetch database listening ports
  const fetchDatabaseInstances = useCallback(async () => {
    const script = `sudo ss -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true`
    const { stdout } = await exec(script)
    const lines = stdout.split('\n')
    const instances: DbInstance[] = []
    lines.forEach(l => {
      const line = l.replace(/\s+/g, ' ').trim()
      if (!line || line.startsWith('Netid') || line.startsWith('Active') || line.startsWith('Proto')) return

      const tokens = line.split(' ')
      if (tokens.length < 4) return

      let localAddressPort = ''
      let processInfo = ''

      if (line.includes('LISTEN') || tokens.includes('LISTEN') || tokens[1] === 'LISTEN') {
        if (line.includes('users:')) {
          localAddressPort = tokens[4]
          processInfo = tokens.slice(6).join(' ')
        } else {
          localAddressPort = tokens[3]
          processInfo = tokens[tokens.length - 1]
        }

        if (localAddressPort) {
          const lastColonIdx = localAddressPort.lastIndexOf(':')
          if (lastColonIdx !== -1) {
            const address = localAddressPort.substring(0, lastColonIdx)
            const port = localAddressPort.substring(lastColonIdx + 1)
            
            let processName = '-'
            let pid = '-'
            if (processInfo.includes('users:')) {
              const match = processInfo.match(/users:\(\("([^"]+)",(?:pid|pgid)=(\d+)/)
              if (match) {
                processName = match[1]
                pid = match[2]
              }
            } else if (processInfo.includes('/')) {
              const match = processInfo.match(/(\d+)\/(.+)/)
              if (match) {
                pid = match[1]
                processName = match[2]
              }
            } else {
              processName = processInfo
            }

            let type: DbInstance['type'] = 'unknown'
            const portNum = parseInt(port)
            const lowerProc = processName.toLowerCase()
            
            if (portNum === 3306 || lowerProc.includes('mysql') || lowerProc.includes('mariadb')) type = 'mysql'
            else if (portNum === 5432 || lowerProc.includes('postgres')) type = 'postgres'
            else if (portNum === 6379 || lowerProc.includes('redis')) type = 'redis'
            else if (portNum === 27017 || lowerProc.includes('mongod')) type = 'mongodb'

            if (type !== 'unknown') {
              if (!instances.some(i => i.port === port && i.type === type)) {
                instances.push({ type, port, address, processName, pid })
              }
            }
          }
        }
      }
    })
    setDbInstances(instances)
    await fetchTunnels()
  }, [exec, fetchTunnels])

  // Initial tab loading
  const loadTabData = useCallback(async (tab: typeof activeSubTab) => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'overview') await fetchOverview()
      else if (tab === 'pm2') await fetchPm2()
      else if (tab === 'services') await fetchServices()
      else if (tab === 'nginx') await fetchNginx()
      else if (tab === 'docker') await fetchDocker()
      else if (tab === 'logs') await fetchLogsContent()
      else if (tab === 'database') await fetchDatabaseInstances()
    } catch (e: any) {
      setError(e.message || 'Lỗi tải dữ liệu')
    }
    setLoading(false)
  }, [activeSubTab, fetchOverview, fetchPm2, fetchServices, fetchNginx, fetchDocker, fetchLogsContent, fetchDatabaseInstances])

  useEffect(() => {
    loadTabData(activeSubTab)

    if (activeSubTab === 'overview') {
      const interval = setInterval(fetchOverview, 4000)
      return () => clearInterval(interval)
    }
    if (activeSubTab === 'docker') {
      const interval = setInterval(fetchDocker, 5000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [activeSubTab, loadTabData, fetchOverview, fetchDocker])

  // Logs stream polling
  useEffect(() => {
    if (activeSubTab === 'logs' && logAutoRefresh) {
      const interval = setInterval(fetchLogsContent, 3000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [activeSubTab, selectedLogPath, logAutoRefresh, fetchLogsContent])

  // Database tunnels polling
  useEffect(() => {
    if (activeSubTab === 'database') {
      const interval = setInterval(fetchTunnels, 3000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [activeSubTab, fetchTunnels])

  // PM2 Action handler
  const handlePm2Action = async (action: 'restart' | 'stop' | 'start' | 'delete', pmId: number) => {
    setLoading(true)
    const { stderr } = await exec(`pm2 ${action} ${pmId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchPm2()
    setLoading(false)
  }

  // PM2 view logs
  const handleViewPm2Logs = async (app: PM2App) => {
    setLoading(true)
    let logs = ''
    if (app.outLog || app.errLog) {
      const cmd = `
        echo "=== STDOUT LOGS (Last 100 lines) ==="
        if [ -f "${app.outLog}" ]; then tail -n 100 "${app.outLog}"; else echo "No stdout log file found"; fi
        echo ""
        echo "=== STDERR LOGS (Last 100 lines) ==="
        if [ -f "${app.errLog}" ]; then tail -n 100 "${app.errLog}"; else echo "No stderr log file found"; fi
      `
      const { stdout } = await exec(cmd)
      logs = stdout
    } else {
      const { stdout } = await exec(`tail -n 100 ~/.pm2/logs/${app.name}-out.log 2>/dev/null || echo "No logs found."`)
      logs = stdout
    }
    setSelectedAppLogs({ name: app.name, logs: stripAnsi(logs) || 'Không tìm thấy log nào.' })
    setLoading(false)
  }

  // Service Action handler
  const handleServiceAction = async (action: 'restart' | 'stop' | 'start', serviceName: string) => {
    setLoading(true)
    const { stderr } = await exec(`sudo systemctl ${action} ${serviceName} || systemctl ${action} ${serviceName}`)
    if (stderr && stderr.includes('Failed')) {
      alert('Lỗi thao tác: ' + stderr)
    }
    await fetchServices()
    setLoading(false)
  }

  // Nginx read file
  const handleReadNginxFile = async (filename: string) => {
    setLoading(true)
    setSelectedNginxFile(filename)
    setNginxTestResult(null)
    const path = `/etc/nginx/sites-available/${filename}`
    const { stdout } = await exec(`cat ${path} || cat /etc/nginx/conf.d/${filename}`)
    setNginxConfigContent(stdout || '')
    setLoading(false)
  }

  // Nginx save and test config
  const handleSaveNginxConfig = async () => {
    if (!selectedNginxFile || savingNginx) return
    setSavingNginx(true)
    setNginxTestResult(null)

    const path = `/etc/nginx/sites-available/${selectedNginxFile}`

    const saveScript = `
      sudo cp ${path} ${path}.bak 2>/dev/null || true
      cat << 'EOF' > /tmp/nginx_config_temp
${nginxConfigContent}
EOF
      sudo mv /tmp/nginx_config_temp ${path} 2>/dev/null || mv /tmp/nginx_config_temp /etc/nginx/conf.d/${selectedNginxFile}
      test_out=$(sudo nginx -t 2>&1)
      test_code=$?
      if [ $test_code -ne 0 ]; then
        sudo mv ${path}.bak ${path} 2>/dev/null || mv ${path}.bak /etc/nginx/conf.d/${selectedNginxFile} 2>/dev/null || true
        echo "===ERROR==="
        echo "$test_out"
      else
        sudo rm ${path}.bak 2>/dev/null || true
        echo "===SUCCESS==="
      fi
    `
    const { stdout } = await exec(saveScript)

    if (stdout.includes('===ERROR===')) {
      const errorMsg = stdout.replace('===ERROR===', '').trim()
      setNginxTestResult({ success: false, message: errorMsg })
    } else {
      setNginxTestResult({ success: true, message: 'Đã kiểm tra cú pháp thành công! (nginx -t ok)' })
    }
    setSavingNginx(false)
  }

  // Reload Nginx service
  const handleReloadNginx = async () => {
    setLoading(true)
    const { stderr } = await exec('sudo systemctl reload nginx || systemctl reload nginx')
    if (stderr && stderr.includes('failed')) {
      alert('Lỗi reload Nginx: ' + stderr)
    } else {
      alert('Đã reload Nginx thành công!')
    }
    setLoading(false)
  }

  // Docker Container actions
  const handleDockerContainerAction = async (action: 'start' | 'stop' | 'restart' | 'rm', containerId: string) => {
    setLoading(true)
    const { stderr } = await exec(`docker ${action} ${containerId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchDocker()
    setLoading(false)
  }

  // Docker Image action
  const handleDockerImageAction = async (action: 'rmi', imageId: string) => {
    setLoading(true)
    const { stderr } = await exec(`docker ${action} ${imageId}`)
    if (stderr && stderr.includes('Error')) {
      alert('Lỗi: ' + stderr)
    }
    await fetchDocker()
    setLoading(false)
  }

  // View docker container logs
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

  // Logs custom log path
  const handleAddLogPath = () => {
    const trimmed = newLogPathInput.trim()
    if (trimmed && !logPaths.includes(trimmed)) {
      setLogPaths([...logPaths, trimmed])
      setSelectedLogPath(trimmed)
      setNewLogPathInput('')
      setShowAddLogInput(false)
    }
  }

  // Database tunnel triggers
  const handleOpenTunnelModal = (port: string, type: string) => {
    setTunnelLocalPortInput(port)
    setTunnelNameInput(`${type.toUpperCase()} Tunnel`)
    setShowCreateTunnelModal({ dbPort: port, dbType: type })
  }

  const handleCreateTunnel = async () => {
    if (!showCreateTunnelModal || !tunnelLocalPortInput || !tunnelNameInput) return
    setLoading(true)
    const result = await window.api.tunnel.startLocal(
      sessionId,
      tunnelNameInput,
      parseInt(tunnelLocalPortInput),
      'localhost',
      parseInt(showCreateTunnelModal.dbPort)
    )
    if (result.error) {
      alert('Lỗi tạo tunnel: ' + result.error)
    } else {
      setShowCreateTunnelModal(null)
      await fetchDatabaseInstances()
    }
    setLoading(false)
  }

  const handleStopTunnel = async (tunnelId: string) => {
    setLoading(true)
    await window.api.tunnel.stop(tunnelId)
    await fetchDatabaseInstances()
    setLoading(false)
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e2e] text-[#cdd6f4] overflow-hidden select-none animate-fade-in">
      {/* Tab Header */}
      <div className="h-10 bg-[#181825] border-b border-white/[0.04] flex items-center px-4 justify-between shrink-0">
        <div className="flex gap-2 items-center">
          <Activity size={14} className="text-[#89b4fa]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#a6adc8]">DevOps Dashboard</span>
        </div>

        <div className="flex gap-1 overflow-x-auto max-w-[70%] no-scrollbar">
          {([
            { id: 'overview', name: 'Overview', icon: Activity },
            { id: 'pm2', name: 'PM2', icon: Layers },
            { id: 'docker', name: 'Docker', icon: Box },
            { id: 'database', name: 'Database', icon: Database },
            { id: 'logs', name: 'Log Streamer', icon: Terminal },
            { id: 'services', name: 'Services', icon: Settings },
            { id: 'nginx', name: 'Nginx', icon: FolderOpen },
            { id: 'sftp', name: 'SFTP', icon: Server },
            { id: 'tunnel', name: 'Tunnel', icon: ArrowRight }
          ] as const).map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveSubTab(id)
                setSelectedNginxFile(null)
                setNginxTestResult(null)
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all shrink-0 ${
                activeSubTab === id
                  ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-medium'
                  : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
              }`}
            >
              <Icon size={12} />
              {name}
            </button>
          ))}
        </div>

        <button
          onClick={() => loadTabData(activeSubTab)}
          disabled={loading}
          className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all disabled:opacity-40 shrink-0"
          title="Tải lại dữ liệu"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main Workspace */}
      <div className={`flex-1 overflow-hidden relative flex flex-col p-4 ${activeSubTab === 'sftp' || activeSubTab === 'tunnel' ? 'hidden' : ''}`}>
        {loading && !sysInfo && !pm2Apps.length && !services.length && !containers.length && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e2e]/50 z-20">
            <RefreshCw size={24} className="animate-spin text-[#89b4fa]" />
          </div>
        )}

        {/* OVERVIEW PANEL */}
        {activeSubTab === 'overview' && sysInfo && (
          <div className="flex-1 overflow-y-auto space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Hệ Điều Hành</span>
                <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.os || 'Linux'}</span>
              </div>
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Uptime</span>
                <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.uptime || 'Unknown'}</span>
              </div>
              <div className="bg-[#181825] border border-white/[0.04] rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#585b70]">Tải trung bình (Load Avg)</span>
                <span className="text-sm font-bold text-[#cdd6f4] truncate mt-1">{sysInfo.load || '0, 0, 0'}</span>
              </div>
            </div>

            {/* Gauges */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
                <Activity className="text-[#89b4fa] mb-2" size={16} />
                <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">CPU Utilization</span>
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-[#89b4fa] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${sysInfo.cpu_used || 0}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-lg font-bold">{(sysInfo.cpu_used || 0).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {(() => {
                const total = sysInfo.mem_total || 1
                const used = sysInfo.mem_used || 0
                const percent = Math.round((used / total) * 100)
                return (
                  <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
                    <Layers className="text-[#a6e3a1] mb-2" size={16} />
                    <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">RAM Utilization</span>
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="text-[#a6e3a1] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${percent}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-lg font-bold">{percent}%</span>
                        <span className="text-[9px] text-[#585b70]">{used} / {total} MB</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {(() => {
                const percent = sysInfo.disk_percent || 0
                const used = ((sysInfo.disk_used || 0) / 1024).toFixed(1)
                const total = ((sysInfo.disk_total || 0) / 1024).toFixed(0)
                return (
                  <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col items-center">
                    <HardDrive className="text-[#fab387] mb-2" size={16} />
                    <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider mb-4">Disk Utilization (/)</span>
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path className="text-[#313244]" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="text-[#fab387] transition-all duration-500 ease-out" strokeWidth="2.5" strokeDasharray={`${percent}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-lg font-bold">{percent}%</span>
                        <span className="text-[9px] text-[#585b70]">{used} / {total} GB</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* System Details & Open Ports */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
                  Thông tin hệ thống chi tiết
                </h3>
                <div className="space-y-3 text-xs flex-1">
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                    <span className="text-[#585b70]">CPU Model</span>
                    <span className="font-semibold text-[#cdd6f4] max-w-[200px] truncate" title={sysInfo.cpu_model}>{sysInfo.cpu_model || 'Generic CPU'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                    <span className="text-[#585b70]">CPU Cores</span>
                    <span className="font-semibold text-[#cdd6f4]">{sysInfo.cpu_cores || 1} Cores</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                    <span className="text-[#585b70]">Swap Memory</span>
                    <span className="font-semibold text-[#cdd6f4]">{sysInfo.swap_used || 0} MB / {sysInfo.swap_total || 0} MB</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                    <span className="text-[#585b70]">IP Nội Bộ (Private IP)</span>
                    <span className="font-mono text-[#cdd6f4]">{sysInfo.local_ip || '127.0.0.1'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-[#585b70]">IP Công Cộng (Public IP)</span>
                    <span className="font-mono text-[#cdd6f4]">{sysInfo.public_ip || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#181825] border border-white/[0.04] rounded-2xl p-5 flex flex-col max-h-[300px] overflow-hidden">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f9e2af]" />
                  Cổng mạng đang lắng nghe (Listening Ports)
                </h3>
                <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-thin">
                  {ports.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-8">Không quét được cổng nào đang mở.</div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                          <th className="pb-2">Port</th>
                          <th className="pb-2">Proto</th>
                          <th className="pb-2">Bound Address</th>
                          <th className="pb-2">Process (PID)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ports.map((p, idx) => (
                          <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                            <td className="py-2 font-mono font-bold text-[#89b4fa]">{p.port}</td>
                            <td className="py-2 font-semibold text-[#a6e3a1] text-[10px]">{p.proto}</td>
                            <td className="py-2 font-mono text-[#6c7086] truncate max-w-[120px]" title={p.address}>{p.address}</td>
                            <td className="py-2 font-semibold text-[#cdd6f4]" title={`PID: ${p.pid}`}>
                              {p.processName} <span className="font-mono text-[#585b70] text-[10px]">({p.pid})</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PM2 Apps */}
        {activeSubTab === 'pm2' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!pm2Installed ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
                <Layers size={36} className="mb-3 opacity-30" />
                <span className="text-xs font-semibold">PM2 không được cài đặt trên máy chủ</span>
                <span className="text-[10px] mt-1 text-[#45475a] max-w-xs text-center leading-relaxed">
                  Vui lòng cài đặt PM2 toàn cục (ví dụ: `npm install -g pm2`) để sử dụng tính năng quản lý tiến trình.
                </span>
              </div>
            ) : pm2Apps.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
                <Layers size={36} className="mb-3 opacity-30" />
                <span className="text-xs font-semibold">Không có app PM2 nào đang chạy</span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                      <th className="p-3">ID</th>
                      <th className="p-3">Tên Ứng Dụng</th>
                      <th className="p-3">PID</th>
                      <th className="p-3">Cổng (Port)</th>
                      <th className="p-3">Trạng Thái</th>
                      <th className="p-3 text-right">CPU</th>
                      <th className="p-3 text-right">Memory</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pm2Apps.map((app) => {
                      const appPorts = ports
                        .filter(p => p.pid === String(app.pid))
                        .map(p => p.port)
                      const uniquePorts = Array.from(new Set(appPorts))

                      return (
                        <tr key={app.pm_id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                          <td className="p-3 font-mono text-[#6c7086]">{app.pm_id}</td>
                          <td className="p-3 font-bold text-[#cdd6f4]">{app.name}</td>
                          <td className="p-3 font-mono text-[#6c7086]">{app.pid}</td>
                          <td className="p-3 font-mono">
                            {uniquePorts.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {uniquePorts.map(p => (
                                  <span key={p} className="bg-[#a6e3a1]/10 text-[#a6e3a1] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    :{p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#585b70]">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                              app.status === 'online' ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                            }`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">{app.cpu}%</td>
                          <td className="p-3 text-right font-mono">{app.memory} MB</td>
                          <td className="p-3">
                            <div className="flex gap-1.5 justify-center">
                              {app.status === 'online' ? (
                                <button
                                  onClick={() => handlePm2Action('stop', app.pm_id)}
                                  className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                                  title="Stop Process"
                                >
                                  <Square size={12} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handlePm2Action('start', app.pm_id)}
                                  className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                                  title="Start Process"
                                >
                                  <Play size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => handlePm2Action('restart', app.pm_id)}
                                className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                                title="Restart Process"
                              >
                                <RefreshCw size={12} />
                              </button>
                              <button
                                onClick={() => handleViewPm2Logs(app)}
                                className="p-1 rounded hover:bg-white/5 text-[#fab387]"
                                title="View Logs"
                              >
                                <FileText size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* DOCKER PANEL */}
        {activeSubTab === 'docker' && (
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
                    onClick={() => { setDockerSubTab('containers'); fetchDocker() }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                      dockerSubTab === 'containers'
                        ? 'bg-accent-blue/15 text-accent-blue'
                        : 'text-surface-mid hover:text-surface-light'
                    }`}
                  >
                    Containers ({containers.length})
                  </button>
                  <button
                    onClick={() => { setDockerSubTab('images'); fetchDocker() }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                      dockerSubTab === 'images'
                        ? 'bg-accent-blue/15 text-accent-blue'
                        : 'text-surface-mid hover:text-surface-light'
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
                            <td className="p-3 font-mono text-[#a6adc8] max-w-[150px] truncate" title={c.image}>{c.image}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                                c.status.toLowerCase().includes('up') ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              {c.ports && c.ports !== '-' ? (
                                <div className="flex flex-wrap gap-1">
                                  {c.ports.split(',').map((p, idx) => (
                                    <span key={idx} className="bg-[#89b4fa]/10 text-[#89b4fa] px-1.5 py-0.5 rounded text-[10px] font-semibold" title={p.trim()}>
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
          </div>
        )}

        {/* LOG STREAMER PANEL */}
        {activeSubTab === 'logs' && (
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Left Files List */}
            <div className="w-64 min-w-64 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-[#11111b]/50 border-b border-white/[0.04] flex items-center justify-between text-[10px] font-semibold text-[#585b70] uppercase tracking-wider">
                <span>Log Files</span>
                <button
                  onClick={() => setShowAddLogInput(!showAddLogInput)}
                  className="p-0.5 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
                  title="Thêm file log"
                >
                  <Plus size={11} />
                </button>
              </div>

              {showAddLogInput && (
                <div className="p-2 border-b border-white/[0.04] bg-[#11111b]/35 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Đường dẫn log file..."
                    value={newLogPathInput}
                    onChange={(e) => setNewLogPathInput(e.target.value)}
                    className="w-full bg-[#1e1e2e] border border-white/5 rounded-md px-2 py-1 text-xs text-[#cdd6f4] outline-none"
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => setShowAddLogInput(false)}
                      className="px-2 py-0.5 rounded text-[9px] bg-white/5 hover:bg-white/10"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleAddLogPath}
                      className="px-2 py-0.5 rounded text-[9px] bg-[#89b4fa] text-[#1e1e2e] font-semibold"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {logPaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => setSelectedLogPath(path)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-all ${
                      selectedLogPath === path
                        ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold'
                        : 'text-[#a6adc8] hover:bg-white/[0.02]'
                    }`}
                  >
                    <Terminal size={12} className="shrink-0 text-[#89b4fa]" />
                    <span className="truncate block flex-1" title={path}>{path.substring(path.lastIndexOf('/') + 1)}</span>
                  </button>
                ))}
              </div>

              <div className="p-2 border-t border-white/[0.04] bg-[#11111b]/35 flex justify-between items-center text-[10px] text-[#585b70]">
                <span>Tự động cập nhật (3s)</span>
                <input
                  type="checkbox"
                  checked={logAutoRefresh}
                  onChange={(e) => setLogAutoRefresh(e.target.checked)}
                  className="rounded bg-[#1e1e2e] border-white/5"
                />
              </div>
            </div>

            {/* Right Log Console */}
            <div className="flex-1 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative">
              {/* Header / Filter */}
              <div className="px-4 py-2 border-b border-white/[0.04] bg-[#181825]/50 flex items-center gap-4">
                <span className="font-mono text-xs text-[#a6adc8] truncate flex-1">{selectedLogPath}</span>
                <input
                  type="text"
                  placeholder="Lọc từ khóa logs..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-48 bg-[#1e1e2e] border border-white/5 rounded-md px-2 py-1 text-xs text-[#cdd6f4] outline-none"
                />
              </div>

              {/* Console display */}
              <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed select-text scrollbar-thin">
                {(() => {
                  const filteredLines = logContent
                    .split('\n')
                    .filter((line) => line.toLowerCase().includes(logSearch.toLowerCase()))

                  if (filteredLines.length === 0) {
                    return <div className="text-[#585b70] text-center py-10">Không tìm thấy log nào khớp với từ khóa.</div>
                  }

                  return filteredLines.map((line, idx) => {
                    let colorClass = 'text-[#bac2de]'
                    const lowerLine = line.toLowerCase()
                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes(' 500 ')) {
                      colorClass = 'text-[#f38ba8] font-bold'
                    } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
                      colorClass = 'text-[#f9e2af]'
                    } else if (lowerLine.includes('success') || lowerLine.includes(' 200 ') || lowerLine.includes(' 201 ')) {
                      colorClass = 'text-[#a6e3a1]'
                    }

                    return (
                      <div key={idx} className={`${colorClass} whitespace-pre-wrap py-0.5 hover:bg-white/[0.02]`}>
                        {line}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        )}

        {/* DATABASE TUNNEL PANEL */}
        {activeSubTab === 'database' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {dbInstances.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
                <Database size={36} className="mb-3 opacity-30" />
                <span className="text-xs font-semibold">Không phát hiện hệ quản trị CSDL nào đang hoạt động</span>
                <span className="text-[10px] mt-1 text-[#45475a] max-w-xs text-center leading-relaxed">
                  Để sử dụng tính năng này, hãy đảm bảo MySQL, Postgres, Redis hoặc MongoDB đang lắng nghe trên server.
                </span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-4">
                  {dbInstances.map((db, idx) => {
                    // Check if tunnel is active
                    const activeTunnel = activeTunnels.find(t => t.targetPort === parseInt(db.port) && t.active)

                    return (
                      <div key={idx} className="bg-[#181825] border border-white/[0.04] rounded-xl p-5 flex flex-col justify-between hover:border-white/[0.08] transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[#fab387]/10 text-[#fab387]">
                              <Database size={18} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-[#cdd6f4] uppercase">{db.type} Server</h4>
                              <span className="text-[10px] font-mono text-[#585b70]">Port {db.port} | {db.processName}</span>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                            activeTunnel ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#585b70]/10 text-[#585b70]'
                          }`}>
                            {activeTunnel ? 'Tunnel Active' : 'Disconnected'}
                          </span>
                        </div>

                        {activeTunnel && (
                          <div className="mt-4 bg-[#11111b] border border-white/[0.02] rounded-lg p-2.5 text-[10px] font-mono text-[#a6adc8] space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[#585b70]">Cổng Cục Bộ:</span>
                              <span className="font-bold text-[#89b4fa]">{activeTunnel.listenPort}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#585b70]">Kết Nối:</span>
                              <span>localhost:{activeTunnel.listenPort}</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-5">
                          {activeTunnel ? (
                            <button
                              onClick={() => handleStopTunnel(activeTunnel.id)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 transition-all active:scale-95"
                            >
                              <Square size={11} />
                              Hủy SSH Tunnel
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenTunnelModal(db.port, db.type)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-all active:scale-95"
                            >
                              <ArrowRight size={11} />
                              Tạo SSH Tunnel
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SYSTEM SERVICES PANEL */}
        {activeSubTab === 'services' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {services.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
                <Settings size={36} className="mb-3 opacity-30" />
                <span className="text-xs font-semibold">Không tìm thấy service DevOps nào</span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-[#181825] border border-white/[0.04] rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[#585b70] font-semibold">
                      <th className="p-3">Dịch vụ (Service)</th>
                      <th className="p-3">Mô tả</th>
                      <th className="p-3">Cổng (Port)</th>
                      <th className="p-3">Trạng Thái (Active)</th>
                      <th className="p-3">Chi tiết (Substate)</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((svc) => {
                      let svcPorts: string[] = []
                      if (svc.pid) {
                        svcPorts = ports.filter(p => p.pid === svc.pid).map(p => p.port)
                      }
                      if (svcPorts.length === 0) {
                        const lowerName = svc.name.toLowerCase()
                        svcPorts = ports.filter(p => {
                          const proc = p.processName.toLowerCase()
                          if (lowerName === 'nginx' && proc.includes('nginx')) return true
                          if (lowerName === 'mysql' && (proc.includes('mysqld') || proc.includes('mysql'))) return true
                          if (lowerName === 'redis' && proc.includes('redis-server')) return true
                          if (lowerName === 'postgresql' && proc.includes('postgres')) return true
                          if (lowerName === 'mongodb' && proc.includes('mongod')) return true
                          if (lowerName === 'ssh' && proc.includes('sshd')) return true
                          return false
                        }).map(p => p.port)
                      }
                      const uniquePorts = Array.from(new Set(svcPorts))

                      return (
                        <tr key={svc.name} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                          <td className="p-3 font-bold text-[#cdd6f4]">{svc.name}</td>
                          <td className="p-3 text-[#a6adc8] max-w-xs truncate" title={svc.description}>{svc.description}</td>
                          <td className="p-3 font-mono">
                            {uniquePorts.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {uniquePorts.map(p => (
                                  <span key={p} className="bg-[#89b4fa]/10 text-[#89b4fa] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    :{p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#585b70]">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                              svc.activeState === 'active' ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : 'bg-[#f38ba8]/10 text-[#f38ba8]'
                            }`}>
                              {svc.activeState}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[#6c7086]">{svc.subState}</td>
                          <td className="p-3">
                            <div className="flex gap-1.5 justify-center">
                              {svc.subState === 'running' ? (
                                <button
                                  onClick={() => handleServiceAction('stop', svc.name)}
                                  className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                                  title="Stop Service"
                                >
                                  <Square size={12} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleServiceAction('start', svc.name)}
                                  className="p-1 rounded hover:bg-white/5 text-[#a6e3a1]"
                                  title="Start Service"
                                >
                                  <Play size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => handleServiceAction('restart', svc.name)}
                                className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                                title="Restart Service"
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* NGINX PANEL */}
        {activeSubTab === 'nginx' && (
          <div className="flex-1 flex gap-4 overflow-hidden">
            <div className="w-56 min-w-56 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider">
                Virtual Hosts
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {nginxFiles.length === 0 ? (
                  <div className="text-center text-[#585b70] text-[10px] py-6">Không tìm thấy file config nào.</div>
                ) : (
                  nginxFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => handleReadNginxFile(file)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all ${
                        selectedNginxFile === file
                          ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold'
                          : 'text-[#a6adc8] hover:bg-white/[0.02]'
                      }`}
                    >
                      <FileCode size={12} className="shrink-0 text-[#89b4fa]" />
                      <span className="truncate">{file}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-white/[0.04] bg-[#11111b]/35">
                <button
                  onClick={handleReloadNginx}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 active:scale-95 transition-all"
                >
                  <RefreshCw size={11} />
                  Reload Nginx
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative">
              {selectedNginxFile ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
                    <span className="font-mono text-xs text-[#a6adc8]">{selectedNginxFile}</span>
                    <button
                      onClick={handleSaveNginxConfig}
                      disabled={savingNginx}
                      className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] text-xs font-semibold hover:bg-[#74c7ec] active:scale-95 disabled:opacity-40 transition-all"
                    >
                      {savingNginx ? 'Đang Lưu...' : 'Lưu Config'}
                    </button>
                  </div>

                  <textarea
                    value={nginxConfigContent}
                    onChange={(e) => setNginxConfigContent(e.target.value)}
                    className="flex-1 p-4 bg-[#181825] text-xs text-[#cdd6f4] outline-none font-mono resize-none leading-relaxed"
                    spellCheck={false}
                  />

                  {nginxTestResult && (
                    <div className={`p-3 border-t text-[11px] font-mono flex items-start gap-2 ${
                      nginxTestResult.success
                        ? 'bg-[#a6e3a1]/5 border-[#a6e3a1]/25 text-[#a6e3a1]'
                        : 'bg-[#f38ba8]/5 border-[#f38ba8]/25 text-[#f38ba8]'
                    }`}>
                      {nginxTestResult.success ? (
                        <CheckCircle size={14} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 overflow-auto whitespace-pre-wrap max-h-24">
                        {nginxTestResult.message}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
                  <FileCode size={36} className="mb-2 opacity-30" />
                  <span className="text-xs">Chọn một file Nginx config để chỉnh sửa</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log Modal for PM2 */}
      {selectedAppLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAppLogs(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-gradient-to-r from-[#181825] to-transparent">
              <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fab387]" />
                PM2 Logs: {selectedAppLogs.name}
              </h3>
              <button onClick={() => setSelectedAppLogs(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={15} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text selection:bg-[#fab387]/25 scrollbar-thin">
              {selectedAppLogs.logs}
            </pre>
          </div>
        </div>
      )}

      {/* Log Modal for Docker Containers */}
      {selectedContainerLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedContainerLogs(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
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

      {/* Create Tunnel Modal */}
      {showCreateTunnelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateTunnelModal(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                Kích hoạt SSH Tunnel ({showCreateTunnelModal.dbType.toUpperCase()})
              </h3>
              <button onClick={() => setShowCreateTunnelModal(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên Kết Nối (Tunnel Name)</label>
                <input
                  type="text"
                  value={tunnelNameInput}
                  onChange={(e) => setTunnelNameInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Cổng Cục Bộ Máy Bạn (Local Listen Port)</label>
                <input
                  type="number"
                  placeholder="3307, 5433, 6380..."
                  value={tunnelLocalPortInput}
                  onChange={(e) => setTunnelLocalPortInput(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                />
                <span className="text-[10px] text-[#585b70] block leading-relaxed">
                  Cổng này sẽ được mở trên máy tính cá nhân của bạn. Kết nối tới `localhost:cổng` sẽ tự động chuyển hướng tới database trên server.
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTunnelModal(null)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateTunnel}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Tạo Tunnel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SFTP Dual-Pane Tab — full bleed, no padding */}
      {activeSubTab === 'sftp' && (
        <div className="flex-1 flex overflow-hidden">
          <SftpPanel sessionId={sessionId} visible={true} onToggle={() => setActiveSubTab('overview')} embedded={true} />
        </div>
      )}

      {/* Tunnel Manager Tab — full bleed, no padding */}
      {activeSubTab === 'tunnel' && (
        <div className="flex-1 flex overflow-hidden">
          <TunnelPanel sessionId={sessionId} visible={true} onToggle={() => setActiveSubTab('overview')} embedded={true} />
        </div>
      )}
    </div>
  )
}
