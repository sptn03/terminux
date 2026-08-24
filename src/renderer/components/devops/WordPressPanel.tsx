import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Plus,
  RefreshCw,
  Trash2,
  Key,
  Package,
  Shield,
  Layers,
  ExternalLink,
  Sliders,
  CheckCircle,
  AlertTriangle,
  X,
  Lock,
  DownloadCloud
} from 'lucide-react'

interface WordPressPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

interface WpSiteInfo {
  path: string
  domain: string
  version: string
  dbName: string
  dbUser: string
  pluginsCount: number
  adminEmail?: string
}

interface WpPlugin {
  name: string
  status: 'active' | 'inactive' | 'must-use'
  update: string
  version: string
}

export default function WordPressPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: WordPressPanelProps) {
  const [wpSites, setWpSites] = useState<WpSiteInfo[]>([])
  const [selectedSite, setSelectedSite] = useState<WpSiteInfo | null>(null)
  const [pluginsList, setPluginsList] = useState<WpPlugin[]>([])
  const [loadingPlugins, setLoadingPlugins] = useState(false)

  // Deploy Modal states
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [deployDomain, setDeployDomain] = useState('myblog.example.com')
  const [deployTitle, setDeployTitle] = useState('My WordPress Site')
  const [deployUser, setDeployUser] = useState('admin')
  const [deployPass, setDeployPass] = useState('WpPass@' + Math.floor(100000 + Math.random() * 900000))
  const [deployEmail, setDeployEmail] = useState('admin@example.com')
  const [deployDbName, setDeployDbName] = useState('wp_blog')
  const [deployDbUser, setDeployDbUser] = useState('wp_user')
  const [deployDbPass, setDeployDbPass] = useState('DbPass@' + Math.floor(100000 + Math.random() * 900000))
  const [deployPhpSocket, setDeployPhpSocket] = useState('/run/php/php8.2-fpm.sock')
  const [deploying, setDeploying] = useState(false)
  const [deployLogs, setDeployLogs] = useState('')

  // Reset Password Modal
  const [showResetPassModal, setShowResetPassModal] = useState(false)
  const [resetUser, setResetUser] = useState('admin')
  const [resetNewPass, setResetNewPass] = useState('')
  const [resettingPass, setResettingPass] = useState(false)

  // Detected PHP Sockets
  const [phpSockets, setPhpSockets] = useState<string[]>([])

  const fetchPhpSockets = useCallback(async () => {
    try {
      const { stdout } = await exec('ls -1 /run/php/*.sock 2>/dev/null || true')
      const sockets = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (sockets.length > 0) {
        setPhpSockets(sockets)
        setDeployPhpSocket(sockets[0])
      }
    } catch {}
  }, [exec])

  const scanWordPressSites = useCallback(async () => {
    try {
      // Find wp-config.php files in /var/www/
      const scanCmd = `
        for cfg in /var/www/*/wp-config.php /var/www/*/*/wp-config.php; do
          [ -f "$cfg" ] || continue
          dir=$(dirname "$cfg")
          
          # parse db details
          dbname=$(grep "DB_NAME" "$cfg" | sed -E "s/.*'DB_NAME',\s*'([^']+)'.*/\\1/" | head -n 1)
          dbuser=$(grep "DB_USER" "$cfg" | sed -E "s/.*'DB_USER',\s*'([^']+)'.*/\\1/" | head -n 1)
          
          # parse domain from directory or dirname
          dname=$(basename "$dir")
          if [ "$dname" = "public" ] || [ "$dname" = "html" ]; then
            dname=$(basename "$(dirname "$dir")")
          fi
          
          ver="Unknown"
          [ -f "$dir/wp-includes/version.php" ] && ver=$(grep "wp_version =" "$dir/wp-includes/version.php" | sed -E "s/.*'([^']+)'.*/\\1/")
          
          echo "$dir::$dname::$ver::$dbname::$dbuser"
        done
      `
      const { stdout } = await exec(scanCmd)
      const list: WpSiteInfo[] = []
      stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          const parts = line.split('::')
          if (parts.length >= 5) {
            list.push({
              path: parts[0],
              domain: parts[1],
              version: parts[2],
              dbName: parts[3],
              dbUser: parts[4],
              pluginsCount: 0
            })
          }
        })

      setWpSites(list)
      if (list.length > 0 && !selectedSite) {
        setSelectedSite(list[0])
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi quét website WordPress')
    }
  }, [exec, selectedSite, setError])

  const fetchPluginsForSite = useCallback(
    async (sitePath: string) => {
      setLoadingPlugins(true)
      try {
        const cmd = `cd "${sitePath}" && wp plugin list --format=json --allow-root 2>/dev/null || true`
        const { stdout } = await exec(cmd)
        if (stdout && stdout.startsWith('[')) {
          const parsed = JSON.parse(stdout)
          setPluginsList(parsed)
        } else {
          // Fallback: list directories in wp-content/plugins
          const fallbackCmd = `ls -1 "${sitePath}/wp-content/plugins" 2>/dev/null || true`
          const fbRes = await exec(fallbackCmd)
          const fallbackList: WpPlugin[] = fbRes.stdout
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => ({
              name: p,
              status: 'active',
              update: 'none',
              version: '1.0'
            }))
          setPluginsList(fallbackList)
        }
      } catch {
        setPluginsList([])
      } finally {
        setLoadingPlugins(false)
      }
    },
    [exec]
  )

  useEffect(() => {
    fetchPhpSockets()
    scanWordPressSites()
  }, [fetchPhpSockets, scanWordPressSites, refreshKey])

  useEffect(() => {
    if (selectedSite) {
      fetchPluginsForSite(selectedSite.path)
    }
  }, [selectedSite, fetchPluginsForSite])

  const handle1ClickDeploy = async () => {
    if (!deployDomain.trim()) {
      alert('Vui lòng nhập tên miền!')
      return
    }

    setDeploying(true)
    setDeployLogs('🚀 Bắt đầu quy trình cài đặt WordPress 1-Click tự động...\n')

    try {
      const targetDir = `/var/www/${deployDomain.trim()}/public`
      const script = `
        set -e
        echo "1. Cài đặt WP-CLI nếu chưa có..."
        if ! command -v wp >/dev/null 2>&1; then
          curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
          chmod +x wp-cli.phar
          sudo mv wp-cli.phar /usr/local/bin/wp
        fi

        echo "2. Khởi tạo Cơ sở dữ liệu MySQL (${deployDbName})..."
        sudo mysql -e "CREATE DATABASE IF NOT EXISTS \\\`${deployDbName}\\\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
        sudo mysql -e "CREATE USER IF NOT EXISTS '${deployDbUser}'@'localhost' IDENTIFIED BY '${deployDbPass}';" 2>/dev/null || true
        sudo mysql -e "GRANT ALL PRIVILEGES ON \\\`${deployDbName}\\\`.* TO '${deployDbUser}'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || true

        echo "3. Tạo thư mục web ${targetDir}..."
        sudo mkdir -p "${targetDir}"
        sudo chown -R www-data:www-data "/var/www/${deployDomain.trim()}"

        echo "4. Tải mã nguồn WordPress Core..."
        sudo -u www-data wp core download --path="${targetDir}" --allow-root 2>/dev/null || wp core download --path="${targetDir}" --allow-root

        echo "5. Tạo tệp wp-config.php..."
        sudo -u www-data wp config create --path="${targetDir}" --dbname="${deployDbName}" --dbuser="${deployDbUser}" --dbpass="${deployDbPass}" --dbhost="127.0.0.1" --allow-root

        echo "6. Cài đặt hệ thống WordPress Admin..."
        sudo -u www-data wp core install --path="${targetDir}" --url="http://${deployDomain.trim()}" --title="${deployTitle}" --admin_user="${deployUser}" --admin_password="${deployPass}" --admin_email="${deployEmail}" --allow-root

        echo "7. Cấu hình Nginx Virtual Host..."
        cat << 'EOF' > /tmp/${deployDomain.trim()}.conf
server {
    listen 80;
    listen [::]:80;
    server_name ${deployDomain.trim()};
    root ${targetDir};

    index index.php index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${deployPhpSocket};
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location ~ /\\. {
        deny all;
    }
}
EOF
        sudo mv /tmp/${deployDomain.trim()}.conf /etc/nginx/sites-available/${deployDomain.trim()}.conf 2>/dev/null || mv /tmp/${deployDomain.trim()}.conf /etc/nginx/conf.d/${deployDomain.trim()}.conf
        sudo ln -s /etc/nginx/sites-available/${deployDomain.trim()}.conf /etc/nginx/sites-enabled/${deployDomain.trim()}.conf 2>/dev/null || true
        sudo nginx -t && sudo systemctl reload nginx
      `
      const res = await exec(script)
      setDeployLogs((prev) => prev + (res.stdout || '') + '\n' + (res.stderr || '') + '\n')

      if (res.code === 0) {
        setDeployLogs((prev) => prev + '🎉 CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!\n')
        alert(`Chúc mừng! WordPress đã được triển khai thành công tại ${deployDomain}`)
        await scanWordPressSites()
        setShowDeployModal(false)
      } else {
        throw new Error(res.stderr || 'Quá trình cài đặt gặp sự cố')
      }
    } catch (e: any) {
      setDeployLogs((prev) => prev + `❌ Lỗi: ${e.message}\n`)
      alert('Lỗi triển khai WordPress: ' + e.message)
    } finally {
      setDeploying(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedSite || !resetUser || !resetNewPass) return
    setResettingPass(true)
    try {
      const cmd = `cd "${selectedSite.path}" && wp user update "${resetUser}" --user_pass="${resetNewPass}" --allow-root`
      const res = await exec(cmd)
      if (res.code === 0) {
        alert(`Đã đổi mật khẩu cho user "${resetUser}" thành công!`)
        setShowResetPassModal(false)
        setResetNewPass('')
      } else {
        alert('Lỗi: ' + res.stderr)
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setResettingPass(false)
    }
  }

  const handleTogglePlugin = async (pluginName: string, currentStatus: string) => {
    if (!selectedSite) return
    const action = currentStatus === 'active' ? 'deactivate' : 'activate'
    setLoadingPlugins(true)
    try {
      await exec(`cd "${selectedSite.path}" && wp plugin ${action} "${pluginName}" --allow-root 2>/dev/null`)
      await fetchPluginsForSite(selectedSite.path)
    } catch (e: any) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoadingPlugins(false)
    }
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Left WP Sites Sidebar */}
      <div className="w-72 min-w-72 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <Globe size={13} className="text-[#89b4fa]" /> WP Sites ({wpSites.length})
          </span>
          <button
            onClick={() => setShowDeployModal(true)}
            className="px-2.5 py-1 bg-[#89b4fa]/15 hover:bg-[#89b4fa]/25 text-[#89b4fa] rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Plus size={12} /> Cài 1-Click
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
          {wpSites.length === 0 ? (
            <div className="text-center text-[#585b70] text-xs py-8">
              Chưa tìm thấy website WordPress nào trên server.
              <button
                onClick={() => setShowDeployModal(true)}
                className="mt-2 block mx-auto text-[#89b4fa] underline text-xs font-semibold"
              >
                Cài đặt WordPress mới 1-Click
              </button>
            </div>
          ) : (
            wpSites.map((site) => (
              <div
                key={site.path}
                onClick={() => setSelectedSite(site)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedSite?.path === site.path
                    ? 'bg-[#89b4fa]/15 border-[#89b4fa]/40 text-[#cdd6f4]'
                    : 'bg-[#11111b]/30 border-white/[0.02] text-[#a6adc8] hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#cdd6f4] truncate">{site.domain}</span>
                  <span className="text-[10px] text-[#a6e3a1] font-mono font-bold">v{site.version}</span>
                </div>
                <div className="text-[10px] text-[#585b70] truncate mt-0.5">DB: {site.dbName}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main WordPress Site Details */}
      <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        {selectedSite ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-5 py-3 border-b border-white/[0.04] bg-[#11111b]/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#cdd6f4] flex items-center gap-2">
                  <span>{selectedSite.domain}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#89b4fa]/15 text-[#89b4fa] font-normal">
                    WordPress {selectedSite.version}
                  </span>
                </h3>
                <span className="text-xs text-[#585b70] font-mono">{selectedSite.path}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResetPassModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#cdd6f4] text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Key size={12} className="text-[#fab387]" /> Reset Pass Admin
                </button>
                <a
                  href={`http://${selectedSite.domain}/wp-admin`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink size={12} /> Mở WP-Admin
                </a>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-[#11111b]/30 border-b border-white/[0.04]">
              <div className="p-3 bg-[#181825] rounded-xl border border-white/5">
                <span className="text-[10px] text-[#585b70] uppercase font-bold tracking-wider">Cơ sở dữ liệu</span>
                <p className="text-xs font-bold text-[#cdd6f4] font-mono mt-0.5">{selectedSite.dbName}</p>
              </div>
              <div className="p-3 bg-[#181825] rounded-xl border border-white/5">
                <span className="text-[10px] text-[#585b70] uppercase font-bold tracking-wider">DB User</span>
                <p className="text-xs font-bold text-[#cdd6f4] font-mono mt-0.5">{selectedSite.dbUser}</p>
              </div>
              <div className="p-3 bg-[#181825] rounded-xl border border-white/5">
                <span className="text-[10px] text-[#585b70] uppercase font-bold tracking-wider">Plugins Đang Cài</span>
                <p className="text-xs font-bold text-[#89b4fa] font-mono mt-0.5">{pluginsList.length} Plugins</p>
              </div>
            </div>

            {/* Plugins Manager */}
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-1.5">
                  <Package size={13} className="text-[#89b4fa]" /> Quản Lý Plugins
                </h4>
                <button
                  onClick={() => fetchPluginsForSite(selectedSite.path)}
                  className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
                  title="Tải lại danh sách plugin"
                >
                  <RefreshCw size={12} className={loadingPlugins ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {pluginsList.length === 0 ? (
                  <div className="text-center text-[#585b70] text-xs py-6">Chưa có plugin nào hoặc đang đọc danh sách...</div>
                ) : (
                  pluginsList.map((p) => (
                    <div
                      key={p.name}
                      className="p-3 rounded-xl bg-[#11111b]/40 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            p.status === 'active' ? 'bg-[#a6e3a1]' : 'bg-[#585b70]'
                          }`}
                        />
                        <div>
                          <h5 className="text-xs font-bold text-[#cdd6f4]">{p.name}</h5>
                          <span className="text-[10px] text-[#585b70]">v{p.version}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTogglePlugin(p.name, p.status)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            p.status === 'active'
                              ? 'bg-[#f38ba8]/15 hover:bg-[#f38ba8]/25 text-[#f38ba8]'
                              : 'bg-[#a6e3a1]/15 hover:bg-[#a6e3a1]/25 text-[#a6e3a1]'
                          }`}
                        >
                          {p.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
            <Globe size={40} className="opacity-30 text-[#89b4fa] mb-2" />
            <span className="text-xs">Chọn website WordPress từ danh sách bên trái hoặc bấm [Cài 1-Click]</span>
          </div>
        )}
      </div>

      {/* 1-Click Deploy WordPress Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeployModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={14} className="text-[#89b4fa]" /> Triển Khai WordPress 1-Click Tự Động
              </h3>
              <button onClick={() => setShowDeployModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto scrollbar-thin">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Tên miền (Domain) *</label>
                  <input
                    type="text"
                    value={deployDomain}
                    onChange={(e) => setDeployDomain(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                    placeholder="blog.example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Tiêu đề Website (Site Title)</label>
                  <input
                    type="text"
                    value={deployTitle}
                    onChange={(e) => setDeployTitle(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                    placeholder="My Blog"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Admin Username *</label>
                  <input
                    type="text"
                    value={deployUser}
                    onChange={(e) => setDeployUser(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Admin Password *</label>
                  <input
                    type="text"
                    value={deployPass}
                    onChange={(e) => setDeployPass(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Admin Email *</label>
                <input
                  type="email"
                  value={deployEmail}
                  onChange={(e) => setDeployEmail(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                <div className="space-y-1">
                  <label className="text-[#585b70] font-semibold text-[10px]">Tên Database</label>
                  <input
                    type="text"
                    value={deployDbName}
                    onChange={(e) => setDeployDbName(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[#585b70] font-semibold text-[10px]">DB Username</label>
                  <input
                    type="text"
                    value={deployDbUser}
                    onChange={(e) => setDeployDbUser(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[#585b70] font-semibold text-[10px]">DB Password</label>
                  <input
                    type="text"
                    value={deployDbPass}
                    onChange={(e) => setDeployDbPass(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] font-mono"
                  />
                </div>
              </div>

              {phpSockets.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">Phiên bản PHP (Socket)</label>
                  <select
                    value={deployPhpSocket}
                    onChange={(e) => setDeployPhpSocket(e.target.value)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                  >
                    {phpSockets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {deployLogs && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-[#585b70] font-semibold">Tiến trình triển khai</label>
                  <pre className="h-32 overflow-y-auto bg-[#11111b] p-2.5 rounded-lg font-mono text-[10px] text-[#a6adc8] whitespace-pre-wrap scrollbar-thin">
                    {deployLogs}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowDeployModal(false)}
                  className="px-4 py-1.5 rounded-xl font-semibold bg-white/5 hover:bg-white/10"
                  disabled={deploying}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handle1ClickDeploy}
                  disabled={deploying}
                  className="px-5 py-1.5 rounded-xl font-bold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {deploying ? 'Đang cài đặt...' : 'Cài Đặt WordPress Ngay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowResetPassModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Key size={14} className="text-[#fab387]" /> Reset Password Admin
              </h3>
              <button onClick={() => setShowResetPassModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên tài khoản (Username) *</label>
                <input
                  type="text"
                  value={resetUser}
                  onChange={(e) => setResetUser(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Mật khẩu mới *</label>
                <input
                  type="text"
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] font-mono outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPassModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resettingPass}
                  className="px-4 py-1.5 rounded-lg font-bold bg-[#fab387] text-[#1e1e2e] hover:bg-[#f8a060] transition-all disabled:opacity-40"
                >
                  {resettingPass ? 'Đang đổi...' : 'Cập Nhật Mật Khẩu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
