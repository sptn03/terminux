import { useState, useEffect, useCallback } from 'react'
import {
  FileCode,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  X,
  Plus,
  Trash2,
  Power,
  ShieldCheck,
  Zap,
  Terminal,
  Globe
} from 'lucide-react'

interface NginxPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface SiteItem {
  name: string
  enabled: boolean
  hasSsl: boolean
  serverName: string
  siteType: 'php' | 'proxy' | 'static' | 'redirect' | 'other'
}

export default function NginxPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: NginxPanelProps) {
  const [siteList, setSiteList] = useState<SiteItem[]>([])
  const [selectedNginxFile, setSelectedNginxFile] = useState<string | null>(null)
  const [nginxConfigContent, setNginxConfigContent] = useState('')
  const [nginxTestResult, setNginxTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savingNginx, setSavingNginx] = useState(false)
  const [detectedPhpSockets, setDetectedPhpSockets] = useState<string[]>([])

  const [nginxInstalled, setNginxInstalled] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')

  // Create Site Modal states
  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false)
  const [newSiteFilename, setNewSiteFilename] = useState('')
  const [newSiteType, setNewSiteType] = useState<'php' | 'proxy' | 'static' | 'redirect'>('php')
  const [newSiteDomain, setNewSiteDomain] = useState('example.com')
  const [newSiteSubdomains, setNewSiteSubdomains] = useState('www.example.com')
  const [newSiteParam, setNewSiteParam] = useState('/var/www/example.com/public')
  const [newSitePhpSocket, setNewSitePhpSocket] = useState('/run/php/php8.2-fpm.sock')
  const [newSiteAutoCreateDir, setNewSiteAutoCreateDir] = useState(true)
  const [creatingSite, setCreatingSite] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // SSL Certbot Wizard states
  const [showSslModal, setShowSslModal] = useState(false)
  const [sslDomain, setSslDomain] = useState('')
  const [sslEmail, setSslEmail] = useState('')
  const [runningSsl, setRunningSsl] = useState(false)
  const [sslLogs, setSslLogs] = useState('')

  // Site Logs Modal states
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logType, setLogType] = useState<'access' | 'error'>('error')
  const [logContent, setLogContent] = useState('')
  const [loadingLog, setLoadingLog] = useState(false)

  // Snippets Modal
  const [showSnippetsModal, setShowSnippetsModal] = useState(false)

  // Detect PHP-FPM sockets available on server
  const detectPhpSockets = useCallback(async () => {
    try {
      const { stdout } = await exec('ls -1 /run/php/*.sock /var/run/php/*.sock 2>/dev/null || true')
      const sockets = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (sockets.length > 0) {
        setDetectedPhpSockets(sockets)
        setNewSitePhpSocket(sockets[0])
      } else {
        setDetectedPhpSockets(['/run/php/php8.2-fpm.sock', '/run/php/php8.1-fpm.sock', '/run/php/php7.4-fpm.sock'])
      }
    } catch {
      setDetectedPhpSockets(['/run/php/php8.2-fpm.sock'])
    }
  }, [exec])

  const fetchNginx = useCallback(async () => {
    try {
      const checkNginx = await exec('nginx -v 2>/dev/null')
      if (checkNginx.code !== 0) {
        setNginxInstalled(false)
        return
      }
      setNginxInstalled(true)

      // Get available sites and enabled sites
      const getSitesCmd = `
        av_dir="/etc/nginx/sites-available"
        en_dir="/etc/nginx/sites-enabled"
        conf_dir="/etc/nginx/conf.d"
        
        if [ -d "$av_dir" ]; then
          for f in "$av_dir"/*; do
            [ -f "$f" ] || continue
            bname=$(basename "$f")
            enabled=0
            [ -f "$en_dir/$bname" ] || [ -L "$en_dir/$bname" ] && enabled=1
            sname=$(grep -E '^[[:space:]]*server_name[[:space:]]+' "$f" | head -n 1 | awk '{print $2}' | tr -d ';' | tr -d '\\r')
            has_ssl=0
            grep -q 'ssl_certificate' "$f" 2>/dev/null && has_ssl=1
            type="static"
            grep -q 'proxy_pass' "$f" 2>/dev/null && type="proxy"
            grep -q 'fastcgi_pass' "$f" 2>/dev/null && type="php"
            grep -q 'return 301' "$f" 2>/dev/null && type="redirect"
            echo "$bname::$enabled::$has_ssl::$type::$sname"
          done
        elif [ -d "$conf_dir" ]; then
          for f in "$conf_dir"/*.conf; do
            [ -f "$f" ] || continue
            bname=$(basename "$f")
            sname=$(grep -E '^[[:space:]]*server_name[[:space:]]+' "$f" | head -n 1 | awk '{print $2}' | tr -d ';' | tr -d '\\r')
            has_ssl=0
            grep -q 'ssl_certificate' "$f" 2>/dev/null && has_ssl=1
            type="static"
            grep -q 'proxy_pass' "$f" 2>/dev/null && type="proxy"
            grep -q 'fastcgi_pass' "$f" 2>/dev/null && type="php"
            grep -q 'return 301' "$f" 2>/dev/null && type="redirect"
            echo "$bname::1::$has_ssl::$type::$sname"
          done
        fi
      `
      const { stdout } = await exec(getSitesCmd)
      const parsed: SiteItem[] = []
      stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          const parts = line.split('::')
          if (parts.length >= 4) {
            parsed.push({
              name: parts[0],
              enabled: parts[1] === '1',
              hasSsl: parts[2] === '1',
              siteType: parts[3] as any,
              serverName: parts[4] || parts[0]
            })
          }
        })

      setSiteList(parsed)
    } catch (e: any) {
      setError(e.message || 'Lỗi tải Virtual Hosts')
    }
  }, [exec, setError])

  const handleReadNginxFile = async (filename: string) => {
    setLoading(true)
    setSelectedNginxFile(filename)
    setNginxTestResult(null)
    try {
      const path = `/etc/nginx/sites-available/${filename}`
      const { stdout } = await exec(`cat ${path} 2>/dev/null || cat /etc/nginx/conf.d/${filename} 2>/dev/null`)
      setNginxConfigContent(stdout || '')
    } catch (e: any) {
      alert('Không đọc được file: ' + e.message)
    }
    setLoading(false)
  }

  const handleToggleSite = async (item: SiteItem) => {
    setLoading(true)
    try {
      if (item.enabled) {
        await exec(`sudo rm -f /etc/nginx/sites-enabled/${item.name}`)
      } else {
        await exec(`sudo ln -s /etc/nginx/sites-available/${item.name} /etc/nginx/sites-enabled/${item.name}`)
      }
      const testRes = await exec('sudo nginx -t 2>&1')
      if (testRes.code !== 0) {
        if (!item.enabled) {
          await exec(`sudo rm -f /etc/nginx/sites-enabled/${item.name}`)
        }
        alert('Cấu hình Nginx lỗi khi bật site: \n' + testRes.stdout)
      } else {
        await exec('sudo systemctl reload nginx')
        await fetchNginx()
      }
    } catch (e: any) {
      alert('Lỗi thao tác: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

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
    try {
      const { stdout } = await exec(saveScript)

      if (stdout.includes('===ERROR===')) {
        const errorMsg = stdout.replace('===ERROR===', '').trim()
        setNginxTestResult({ success: false, message: errorMsg })
      } else {
        setNginxTestResult({ success: true, message: 'Đã kiểm tra cú pháp thành công! (nginx -t OK)' })
        await exec('sudo systemctl reload nginx')
        await fetchNginx()
      }
    } catch (e: any) {
      setNginxTestResult({ success: false, message: 'Lỗi thực thi script lưu: ' + e.message })
    }
    setSavingNginx(false)
  }

  const handleReloadNginx = async () => {
    setLoading(true)
    const { stderr, stdout } = await exec('sudo nginx -t 2>&1 && sudo systemctl reload nginx')
    if (stderr && stderr.includes('failed')) {
      alert('Lỗi reload Nginx: ' + stderr)
    } else {
      alert('Đã reload Nginx thành công!\n' + (stdout || ''))
    }
    setLoading(false)
  }

  const handleCreateSiteFromModal = async () => {
    if (!newSiteFilename.trim() || !newSiteDomain.trim()) {
      alert('Vui lòng nhập tên file và tên miền!')
      return
    }

    const filename = newSiteFilename.trim().replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!filename) {
      alert('Tên file không hợp lệ!')
      return
    }

    const domainList = [newSiteDomain.trim(), newSiteSubdomains.trim()].filter(Boolean).join(' ')

    setCreatingSite(true)
    try {
      let generated = ''

      if (newSiteType === 'php') {
        const rootPath = newSiteParam.trim() || `/var/www/${newSiteDomain.trim()}/public`
        const socketPath = newSitePhpSocket.trim() || '/run/php/php8.2-fpm.sock'

        generated = `server {
    listen 80;
    listen [::]:80;
    server_name ${domainList};
    root ${rootPath};

    index index.php index.html index.htm;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${socketPath};
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\\. {
        deny all;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/${newSiteDomain.trim()}_access.log;
    error_log /var/log/nginx/${newSiteDomain.trim()}_error.log;
}`
      } else if (newSiteType === 'proxy') {
        const port = newSiteParam.trim() || '3000'
        generated = `server {
    listen 80;
    listen [::]:80;
    server_name ${domainList};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    access_log /var/log/nginx/${newSiteDomain.trim()}_access.log;
    error_log /var/log/nginx/${newSiteDomain.trim()}_error.log;
}`
      } else if (newSiteType === 'static') {
        const rootPath = newSiteParam.trim() || `/var/www/${newSiteDomain.trim()}`
        generated = `server {
    listen 80;
    listen [::]:80;
    server_name ${domainList};
    root ${rootPath};
    index index.html index.htm;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    access_log /var/log/nginx/${newSiteDomain.trim()}_access.log;
    error_log /var/log/nginx/${newSiteDomain.trim()}_error.log;
}`
      } else {
        generated = `server {
    listen 80;
    listen [::]:80;
    server_name ${domainList};
    return 301 https://$host$request_uri;
}`
      }

      // Auto-create directory and sample index if requested
      if (newSiteAutoCreateDir && (newSiteType === 'php' || newSiteType === 'static')) {
        const targetRoot = newSiteParam.trim() || (newSiteType === 'php' ? `/var/www/${newSiteDomain.trim()}/public` : `/var/www/${newSiteDomain.trim()}`)
        const initScript = `
          sudo mkdir -p "${targetRoot}"
          sudo chown -R www-data:www-data "${targetRoot}" 2>/dev/null || true
          sudo chmod -R 755 "${targetRoot}"
          if [ ! -f "${targetRoot}/index.html" ] && [ ! -f "${targetRoot}/index.php" ]; then
            ${
              newSiteType === 'php'
                ? `echo "<?php phpinfo(); ?>" | sudo tee "${targetRoot}/index.php" >/dev/null`
                : `echo "<!DOCTYPE html><html><head><title>${newSiteDomain}</title></head><body><h1>Welcome to ${newSiteDomain}!</h1></body></html>" | sudo tee "${targetRoot}/index.html" >/dev/null`
            }
            sudo chown www-data:www-data "${targetRoot}/index.*" 2>/dev/null || true
          fi
        `
        await exec(initScript)
      }

      const pathCheck = await exec('[ -d /etc/nginx/sites-available ] && echo "available" || echo "conf.d"')
      const targetDir = pathCheck.stdout.trim() === 'available' ? '/etc/nginx/sites-available' : '/etc/nginx/conf.d'
      const filePath = `${targetDir}/${filename}`

      const tempFile = `/tmp/${filename}_temp`
      const writeCmd = `cat << 'EOF' > ${tempFile}\n${generated}\nEOF\nsudo mv ${tempFile} ${filePath}`
      const writeRes = await exec(writeCmd)
      if (writeRes.code !== 0) {
        throw new Error(writeRes.stderr || 'Không thể tạo tệp cấu hình')
      }

      if (targetDir === '/etc/nginx/sites-available') {
        await exec(`sudo ln -s ${filePath} /etc/nginx/sites-enabled/${filename} 2>/dev/null || true`)
      }

      const testRes = await exec('sudo nginx -t 2>&1')
      if (testRes.code !== 0) {
        alert('Cảnh báo: File đã được tạo nhưng Nginx báo lỗi cú pháp: \n' + testRes.stdout)
      } else {
        await exec('sudo systemctl reload nginx')
      }

      await fetchNginx()
      setSelectedNginxFile(filename)
      setNginxConfigContent(generated)
      setNginxTestResult(null)
      setShowCreateSiteModal(false)

      alert('Đã tạo Virtual Host và thư mục web thành công!')
    } catch (e: any) {
      alert('Lỗi tạo cấu hình: ' + e.message)
    } finally {
      setCreatingSite(false)
    }
  }

  const handleDeleteSite = async (filename: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình site "${filename}" không?\n(Dữ liệu source code trong /var/www/ sẽ không bị xóa)`)) {
      return
    }

    setLoading(true)
    try {
      const cmd = `
        sudo rm -f /etc/nginx/sites-enabled/${filename} 2>/dev/null || true
        sudo rm -f /etc/nginx/sites-available/${filename} 2>/dev/null || true
        sudo rm -f /etc/nginx/conf.d/${filename} 2>/dev/null || true
      `
      await exec(cmd)
      await exec('sudo systemctl reload nginx || systemctl reload nginx')

      await fetchNginx()
      if (selectedNginxFile === filename) {
        setSelectedNginxFile(null)
        setNginxConfigContent('')
        setNginxTestResult(null)
      }
      alert(`Đã xóa cấu hình site "${filename}" thành công!`)
    } catch (e: any) {
      alert('Lỗi xóa site: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInstallNginx = async () => {
    setInstalling(true)
    setInstallLog('Đang chuẩn bị cài đặt Nginx...\n')
    try {
      setInstallLog((prev) => prev + 'Đang cập nhật danh sách gói (apt-get update)...\n')
      await exec('sudo apt-get update')

      setInstallLog((prev) => prev + 'Đang cài đặt Nginx...\n')
      const res = await exec('sudo apt-get install -y nginx')

      if (res.code === 0) {
        setInstallLog((prev) => prev + 'Khởi chạy dịch vụ Nginx...\n')
        await exec('sudo systemctl start nginx && sudo systemctl enable nginx')
        alert('Cài đặt Nginx thành công!')
      } else {
        throw new Error(res.stderr || 'Lỗi cài đặt thất bại.')
      }
      await loadData()
    } catch (e: any) {
      setInstallLog((prev) => prev + `Lỗi: ${e.message}\n`)
      alert('Lỗi cài đặt Nginx: ' + e.message)
    } finally {
      setInstalling(false)
    }
  }

  const handleOpenSslWizard = () => {
    const match = nginxConfigContent.match(/server_name\s+([^;]+);/)
    if (match && match[1]) {
      setSslDomain(match[1].trim().split(/\s+/)[0])
    } else {
      setSslDomain('')
    }
    setSslEmail('')
    setSslLogs('')
    setRunningSsl(false)
    setShowSslModal(true)
  }

  const handleRunSslCertbot = async () => {
    if (!sslDomain.trim()) {
      alert('Vui lòng nhập tên miền (Domain Name)!')
      return
    }
    setRunningSsl(true)
    setSslLogs('Đang kiểm tra certbot trên máy chủ...\n')
    try {
      const checkCertbot = await exec('which certbot')
      if (checkCertbot.code !== 0) {
        setSslLogs((prev) => prev + 'Không tìm thấy certbot. Đang tiến hành cài đặt certbot và plugin nginx...\n')
        await exec('sudo apt-get update')
        const installRes = await exec('sudo apt-get install -y certbot python3-certbot-nginx')
        if (installRes.code !== 0) {
          throw new Error('Cài đặt certbot thất bại: ' + installRes.stderr)
        }
        setSslLogs((prev) => prev + 'Cài đặt certbot thành công!\n')
      } else {
        setSslLogs((prev) => prev + 'Đã có sẵn certbot. Bắt đầu sinh chứng chỉ SSL...\n')
      }

      const emailArg = sslEmail.trim() ? `-m "${sslEmail.trim()}"` : '--register-unsafely-without-email'
      const certbotCmd = `sudo certbot --nginx -d "${sslDomain.trim()}" --non-interactive --agree-tos ${emailArg}`
      setSslLogs((prev) => prev + `Đang thực thi: ${certbotCmd}\n`)

      const res = await exec(certbotCmd)
      setSslLogs((prev) => prev + res.stdout + '\n' + res.stderr + '\n')
      if (res.code === 0) {
        setSslLogs((prev) => prev + '✅ Kích hoạt SSL thành công! Website đã được chuyển hướng sang HTTPS.\n')
        alert('Cài đặt SSL Let\'s Encrypt thành công!')
        if (selectedNginxFile) handleReadNginxFile(selectedNginxFile)
        await fetchNginx()
      } else {
        throw new Error('Sinh chứng chỉ thất bại: ' + res.stderr)
      }
    } catch (err: any) {
      setSslLogs((prev) => prev + `❌ Lỗi: ${err.message}\n`)
      alert('Lỗi cài đặt SSL: ' + err.message)
    } finally {
      setRunningSsl(false)
    }
  }

  const handleFetchSiteLogs = async (type: 'access' | 'error') => {
    setLogType(type)
    setLoadingLog(true)
    setShowLogsModal(true)

    try {
      const match = nginxConfigContent.match(new RegExp(`${type}_log\\s+([^;]+);`))
      let logPath = match ? match[1].trim().split(/\s+/)[0] : `/var/log/nginx/${type}.log`
      if (logPath === 'off') logPath = `/var/log/nginx/${type}.log`

      const { stdout, stderr } = await exec(`sudo tail -n 120 "${logPath}" 2>/dev/null || tail -n 120 /var/log/nginx/${type}.log 2>/dev/null`)
      setLogContent(stdout || stderr || '(Log trống hoặc chưa có dữ liệu)')
    } catch (err: any) {
      setLogContent('Lỗi đọc file log: ' + err.message)
    } finally {
      setLoadingLog(false)
    }
  }

  const handleInsertSnippet = (snippet: string) => {
    setNginxConfigContent((prev) => {
      const lastBraceIndex = prev.lastIndexOf('}')
      if (lastBraceIndex !== -1) {
        return prev.slice(0, lastBraceIndex) + '\n    ' + snippet.trim() + '\n' + prev.slice(lastBraceIndex)
      }
      return prev + '\n' + snippet
    })
    setShowSnippetsModal(false)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await detectPhpSockets()
    await fetchNginx()
    setSelectedNginxFile(null)
    setNginxTestResult(null)
    setLoading(false)
  }, [detectPhpSockets, fetchNginx, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {!nginxInstalled ? (
        <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-md mx-auto p-6 text-center space-y-4">
          <FileCode size={48} className="text-[#89b4fa] opacity-60 animate-bounce" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#cdd6f4]">Nginx chưa được cài đặt trên máy chủ</h3>
            <p className="text-xs text-[#585b70]">
              Không tìm thấy lệnh nginx trên máy chủ SSH này. Bạn có thể tự động cài đặt Nginx qua 1-click.
            </p>
          </div>

          {installing ? (
            <div className="w-full bg-[#181825] border border-white/5 rounded-xl p-4 flex flex-col text-left space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#89b4fa] tracking-wider animate-pulse flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Đang cài đặt Nginx...
              </span>
              <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[9px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                {installLog}
              </pre>
            </div>
          ) : (
            <button
              onClick={handleInstallNginx}
              className="px-4 py-2 rounded-xl bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
            >
              Cài đặt Nginx tự động
            </button>
          )}
        </div>
      ) : (
        <div className="flex-grow flex-shrink flex-basis-0 min-w-0 flex gap-4 overflow-hidden">
          {/* Left Virtual Hosts Sidebar */}
          <div className="w-72 min-w-72 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Globe size={13} className="text-[#89b4fa]" /> Websites ({siteList.length})
              </span>
              <button
                onClick={() => {
                  setNewSiteFilename('')
                  setNewSiteDomain('example.com')
                  setNewSiteSubdomains('www.example.com')
                  setNewSiteParam('/var/www/example.com/public')
                  setShowCreateSiteModal(true)
                }}
                className="px-2 py-1 bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                title="Tạo Website / Virtual Host mới"
              >
                <Plus size={12} /> Thêm Site
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
              {siteList.length === 0 ? (
                <div className="text-center text-[#585b70] text-xs py-8">Chưa có Virtual Host nào.</div>
              ) : (
                siteList.map((site) => (
                  <div
                    key={site.name}
                    onClick={() => handleReadNginxFile(site.name)}
                    className={`group flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                      selectedNginxFile === site.name
                        ? 'bg-[#89b4fa]/10 border-[#89b4fa]/40 text-[#cdd6f4]'
                        : 'bg-[#11111b]/30 border-white/[0.02] text-[#a6adc8] hover:bg-white/[0.03] hover:border-white/[0.06]'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            site.enabled ? 'bg-[#a6e3a1] shadow-[0_0_8px_rgba(166,227,161,0.5)]' : 'bg-[#585b70]'
                          }`}
                          title={site.enabled ? 'Site đang bật' : 'Site đang tắt'}
                        />
                        <span className="font-semibold text-xs text-[#cdd6f4] truncate">{site.serverName || site.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[#585b70]">
                        <span className="uppercase font-mono font-bold px-1.5 py-0.2 bg-white/5 rounded text-[#89b4fa]">
                          {site.siteType}
                        </span>
                        {site.hasSsl && (
                          <span className="text-[#a6e3a1] flex items-center gap-0.5" title="Có chứng chỉ SSL">
                            <ShieldCheck size={10} /> SSL
                          </span>
                        )}
                        <span className="truncate opacity-75">{site.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleSite(site)
                        }}
                        className={`p-1.5 rounded-lg transition-all ${
                          site.enabled
                            ? 'text-[#a6e3a1] hover:bg-[#a6e3a1]/15'
                            : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/5'
                        }`}
                        title={site.enabled ? 'Tắt website này' : 'Bật website này'}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSite(site.name)
                        }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#f38ba8]/15 text-[#f38ba8] transition-all"
                        title="Xóa Site"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 border-t border-white/[0.04] bg-[#11111b]/35 flex gap-2">
              <button
                onClick={handleReloadNginx}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-[#89b4fa]/10 text-[#89b4fa] hover:bg-[#89b4fa]/20 active:scale-95 transition-all"
              >
                <RefreshCw size={12} /> Reload Nginx
              </button>
            </div>
          </div>

          {/* Right Editor & Controls Area */}
          <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden relative">
            {selectedNginxFile ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header Toolbar */}
                <div className="px-4 py-2.5 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-[#89b4fa]" />
                    <span className="font-mono text-xs font-bold text-[#cdd6f4]">{selectedNginxFile}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFetchSiteLogs('error')}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#f38ba8] flex items-center gap-1 transition-all"
                      title="Xem Error Log"
                    >
                      <Terminal size={12} /> Error Log
                    </button>
                    <button
                      onClick={() => handleFetchSiteLogs('access')}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#a6adc8] flex items-center gap-1 transition-all"
                      title="Xem Access Log"
                    >
                      <Terminal size={12} /> Access Log
                    </button>

                    <button
                      onClick={handleOpenSslWizard}
                      className="px-3 py-1 rounded-lg bg-[#a6e3a1]/15 text-[#a6e3a1] hover:bg-[#a6e3a1]/25 text-xs font-semibold flex items-center gap-1 transition-all"
                    >
                      <ShieldCheck size={12} /> SSL Let's Encrypt
                    </button>

                    <button
                      onClick={() => setShowSnippetsModal(true)}
                      className="px-3 py-1 rounded-lg bg-[#fab387]/15 text-[#fab387] hover:bg-[#fab387]/25 text-xs font-semibold flex items-center gap-1 transition-all"
                    >
                      <Zap size={12} /> Snippets
                    </button>

                    <button
                      onClick={handleSaveNginxConfig}
                      disabled={savingNginx}
                      className="px-3.5 py-1 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1"
                    >
                      {savingNginx ? 'Đang Lưu...' : 'Lưu & Test Config'}
                    </button>
                  </div>
                </div>

                <textarea
                  value={nginxConfigContent}
                  onChange={(e) => setNginxConfigContent(e.target.value)}
                  className="flex-1 p-4 bg-[#181825] text-xs text-[#cdd6f4] outline-none font-mono resize-none leading-relaxed"
                  spellCheck={false}
                />

                {nginxTestResult && (
                  <div
                    className={`p-3 border-t text-xs font-mono flex items-start gap-2 ${
                      nginxTestResult.success
                        ? 'bg-[#a6e3a1]/10 border-[#a6e3a1]/25 text-[#a6e3a1]'
                        : 'bg-[#f38ba8]/10 border-[#f38ba8]/25 text-[#f38ba8]'
                    }`}
                  >
                    {nginxTestResult.success ? (
                      <CheckCircle size={15} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 overflow-auto whitespace-pre-wrap max-h-28">{nginxTestResult.message}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#585b70] space-y-2">
                <Globe size={40} className="opacity-30 text-[#89b4fa]" />
                <span className="text-xs font-medium">Chọn một Website từ danh sách bên trái hoặc bấm [Thêm Site]</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Site Modal */}
      {showCreateSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateSiteModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={14} className="text-[#89b4fa]" /> Tạo Website / Virtual Host Mới
              </h3>
              <button onClick={() => setShowCreateSiteModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto scrollbar-thin">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Loại Website / Framework</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'php', label: 'PHP / Laravel' },
                    { id: 'proxy', label: 'Node / Proxy' },
                    { id: 'static', label: 'Static / HTML' },
                    { id: 'redirect', label: 'Redirect 301' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setNewSiteType(t.id as any)
                        if (t.id === 'php') {
                          setNewSiteParam(`/var/www/${newSiteDomain}/public`)
                        } else if (t.id === 'static') {
                          setNewSiteParam(`/var/www/${newSiteDomain}`)
                        } else if (t.id === 'proxy') {
                          setNewSiteParam('3000')
                        }
                      }}
                      className={`py-2 px-2 rounded-xl border text-center font-medium transition-all ${
                        newSiteType === t.id
                          ? 'bg-[#89b4fa]/20 border-[#89b4fa] text-[#89b4fa] font-bold'
                          : 'bg-[#181825] border-white/5 text-[#a6adc8] hover:bg-white/5'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Tên miền chính (Primary Domain) *</label>
                  <input
                    type="text"
                    placeholder="example.com"
                    value={newSiteDomain}
                    onChange={(e) => {
                      setNewSiteDomain(e.target.value)
                      if (!newSiteFilename || newSiteFilename === `${newSiteDomain}.conf`) {
                        setNewSiteFilename(`${e.target.value}.conf`)
                      }
                      if (newSiteType === 'php') {
                        setNewSiteParam(`/var/www/${e.target.value}/public`)
                      } else if (newSiteType === 'static') {
                        setNewSiteParam(`/var/www/${e.target.value}`)
                      }
                    }}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Subdomains / Alias</label>
                  <input
                    type="text"
                    placeholder="www.example.com"
                    value={newSiteSubdomains}
                    onChange={(e) => setNewSiteSubdomains(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên file cấu hình (.conf) *</label>
                <input
                  type="text"
                  placeholder="example.com.conf"
                  value={newSiteFilename}
                  onChange={(e) => setNewSiteFilename(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              {newSiteType === 'php' && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Phiên bản PHP (PHP-FPM Socket)</label>
                  <select
                    value={newSitePhpSocket}
                    onChange={(e) => setNewSitePhpSocket(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  >
                    {detectedPhpSockets.map((sock) => (
                      <option key={sock} value={sock}>
                        {sock}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newSiteType !== 'redirect' && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">
                    {newSiteType === 'proxy' ? 'Cổng ứng dụng Local (Port Proxy) *' : 'Thư mục Web Root *'}
                  </label>
                  {newSiteType === 'proxy' ? (
                    <input
                      type="text"
                      placeholder="3000"
                      value={newSiteParam}
                      onChange={(e) => setNewSiteParam(e.target.value)}
                      className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                    />
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="/var/www/domain/public"
                        value={newSiteParam}
                        onChange={(e) => setNewSiteParam(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPicker(true)}
                        className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs"
                      >
                        Duyệt...
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(newSiteType === 'php' || newSiteType === 'static') && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={newSiteAutoCreateDir}
                    onChange={(e) => setNewSiteAutoCreateDir(e.target.checked)}
                    className="rounded border-white/10 bg-[#181825] text-[#89b4fa]"
                  />
                  <span className="text-[#cdd6f4] text-xs">
                    Tự động tạo thư mục và file index mẫu (chown www-data:www-data)
                  </span>
                </label>
              )}

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateSiteModal(false)}
                  className="px-4 py-1.5 rounded-xl font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateSiteFromModal}
                  disabled={creatingSite}
                  className="px-5 py-1.5 rounded-xl font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {creatingSite ? 'Đang tạo...' : 'Tạo Website Ngay'}
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
          onSelect={(path) => setNewSiteParam(path)}
        />
      )}

      {/* Snippets Modal */}
      {showSnippetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSnippetsModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[500px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Zap size={14} className="text-[#fab387]" /> Thư Viện Nginx Snippets & Tối Ưu
              </h3>
              <button onClick={() => setShowSnippetsModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {[
                {
                  name: 'Chống Hotlink Ảnh (Hotlink Protection)',
                  desc: 'Chặn các trang web khác nhúng link trực tiếp hình ảnh/video',
                  code: `
    location ~* \\.(gif|jpg|jpeg|png|webp|mp4|zip)$ {
        valid_referers none blocked server_names ~\\.google\\. ~\\.bing\\. ~\\.facebook\\.;
        if ($invalid_referer) {
            return 403;
        }
    }`
                },
                {
                  name: 'Rate Limiting / Chống Brute-force',
                  desc: 'Giới hạn tần suất request để chống flood bot',
                  code: `
    limit_req zone=one burst=20 nodelay;`
                },
                {
                  name: 'Security Headers Chuẩn OWASP',
                  desc: 'Bảo vệ XSS, Clickjacking, MIME sniffing',
                  code: `
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;`
                },
                {
                  name: 'Static Assets Caching (Browser Cache 30 ngày)',
                  desc: 'Tăng tốc tải trang với header Cache-Control cho CSS/JS/Image',
                  code: `
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|svg)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }`
                }
              ].map((snip) => (
                <div key={snip.name} className="p-3 rounded-xl bg-[#181825] border border-white/5 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-[#cdd6f4]">{snip.name}</h4>
                    <p className="text-[11px] text-[#585b70] mt-0.5">{snip.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInsertSnippet(snip.code)}
                    className="px-3 py-1.5 rounded-lg bg-[#fab387]/15 text-[#fab387] hover:bg-[#fab387]/25 text-xs font-semibold shrink-0"
                  >
                    Chèn vào config
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SSL Certbot Wizard Modal */}
      {showSslModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSslModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[460px] max-h-[85vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#a6e3a1]" />
                Cài đặt SSL Let's Encrypt Tự Động
              </h3>
              <button onClick={() => setShowSslModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs overflow-y-auto scrollbar-thin">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên miền (Domain Name) *</label>
                <input
                  type="text"
                  value={sslDomain}
                  onChange={(e) => setSslDomain(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono focus:border-[#a6e3a1]/50"
                  placeholder="example.com"
                  disabled={runningSsl}
                />
                <span className="text-[10px] text-[#585b70]">Đảm bảo tên miền đã trỏ bản ghi A/CNAME về địa chỉ IP của máy chủ này.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Email thông báo gia hạn</label>
                <input
                  type="email"
                  value={sslEmail}
                  onChange={(e) => setSslEmail(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                  placeholder="admin@example.com"
                  disabled={runningSsl}
                />
              </div>

              {sslLogs && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Tiến trình thực thi</label>
                  <pre className="h-40 overflow-y-auto bg-[#11111b] p-3 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                    {sslLogs}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSslModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                  disabled={runningSsl}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleRunSslCertbot}
                  disabled={runningSsl}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#a6e3a1] text-[#1e1e2e] hover:bg-[#86c581] active:scale-95 transition-all disabled:opacity-40"
                >
                  {runningSsl ? 'Đang cấp chứng chỉ...' : 'Cài đặt SSL Ngay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Realtime Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLogsModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[680px] h-[520px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <div className="flex items-center gap-3">
                <Terminal size={14} className="text-[#89b4fa]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">
                  {logType === 'error' ? 'Nginx Error Log' : 'Nginx Access Log'} ({selectedNginxFile})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFetchSiteLogs(logType)}
                  className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                  title="Tải lại log"
                >
                  <RefreshCw size={12} className={loadingLog ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setShowLogsModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 bg-[#11111b] overflow-hidden flex flex-col">
              <pre className="flex-1 overflow-y-auto font-mono text-[10px] text-[#cdd6f4] leading-relaxed whitespace-pre-wrap scrollbar-thin">
                {logContent}
              </pre>
            </div>
          </div>
        </div>
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
              className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-[#cdd6f4]"
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
                className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] text-xs font-bold"
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
