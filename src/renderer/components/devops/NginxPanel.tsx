import { useState, useEffect, useCallback } from 'react'
import { FileCode, RefreshCw, AlertTriangle, CheckCircle, X, Plus, Trash2 } from 'lucide-react'

interface NginxPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function NginxPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: NginxPanelProps) {
  const [nginxFiles, setNginxFiles] = useState<string[]>([])
  const [selectedNginxFile, setSelectedNginxFile] = useState<string | null>(null)
  const [nginxConfigContent, setNginxConfigContent] = useState('')
  const [nginxTestResult, setNginxTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savingNginx, setSavingNginx] = useState(false)
  const [showNginxWizard, setShowNginxWizard] = useState(false)

  const [nginxInstalled, setNginxInstalled] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')

  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false)
  const [newSiteFilename, setNewSiteFilename] = useState('')
  const [newSiteType, setNewSiteType] = useState('proxy')
  const [newSiteDomain, setNewSiteDomain] = useState('example.com')
  const [newSiteParam, setNewSiteParam] = useState('3000')
  const [creatingSite, setCreatingSite] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const fetchNginx = useCallback(async () => {
    try {
      const checkNginx = await exec('nginx -v 2>/dev/null')
      if (checkNginx.code !== 0) {
        setNginxInstalled(false)
        return
      }
      setNginxInstalled(true)

      const { stdout } = await exec('ls -1 /etc/nginx/sites-available/ 2>/dev/null || ls -1 /etc/nginx/conf.d/ 2>/dev/null')
      if (stdout) {
        const files = stdout
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
        setNginxFiles(files)
      } else {
        setNginxFiles([])
      }
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
      const { stdout } = await exec(`cat ${path} || cat /etc/nginx/conf.d/${filename}`)
      setNginxConfigContent(stdout || '')
    } catch (e: any) {
      alert('Không đọc được file: ' + e.message)
    }
    setLoading(false)
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
        setNginxTestResult({ success: true, message: 'Đã kiểm tra cú pháp thành công! (nginx -t ok)' })
      }
    } catch (e: any) {
      setNginxTestResult({ success: false, message: 'Lỗi thực thi script lưu: ' + e.message })
    }
    setSavingNginx(false)
  }

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

  const handleCreateSiteFromModal = async () => {
    if (!newSiteFilename.trim() || !newSiteDomain.trim() || !newSiteParam.trim()) {
      alert('Vui lòng nhập đầy đủ các trường thông tin!')
      return
    }

    const filename = newSiteFilename.trim()
    const sanitized = filename.replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!sanitized) {
      alert('Tên file không hợp lệ!')
      return
    }

    if (nginxFiles.includes(sanitized)) {
      alert('Tên file cấu hình đã tồn tại!')
      return
    }

    setCreatingSite(true)
    try {
      let generated = ''
      if (newSiteType === 'proxy') {
        generated = `server {
    listen 80;
    server_name ${newSiteDomain};

    location / {
        proxy_pass http://127.0.0.1:${newSiteParam};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`
      } else if (newSiteType === 'static') {
        generated = `server {
    listen 80;
    server_name ${newSiteDomain};
    root ${newSiteParam};
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }
}`
      } else {
        generated = `server {
    listen 80;
    server_name ${newSiteDomain};
    return 301 https://$host$request_uri;
}`
      }

      const pathCheck = await exec('[ -d /etc/nginx/sites-available ] && echo "available" || echo "conf.d"')
      const targetDir = pathCheck.stdout.trim() === 'available' ? '/etc/nginx/sites-available' : '/etc/nginx/conf.d'
      const filePath = `${targetDir}/${sanitized}`

      const tempFile = `/tmp/${sanitized}_temp`
      const writeCmd = `cat << 'EOF' > ${tempFile}\n${generated}\nEOF\nsudo mv ${tempFile} ${filePath}`
      const writeRes = await exec(writeCmd)
      if (writeRes.code !== 0) {
        throw new Error(writeRes.stderr || 'Không thể tạo tệp cấu hình')
      }

      if (targetDir === '/etc/nginx/sites-available') {
        await exec(`sudo ln -s ${filePath} /etc/nginx/sites-enabled/${sanitized} 2>/dev/null || true`)
      }

      await exec('sudo systemctl reload nginx || systemctl reload nginx')

      await fetchNginx()
      setSelectedNginxFile(sanitized)
      setNginxConfigContent(generated)
      setNginxTestResult(null)
      setShowCreateSiteModal(false)

      setNewSiteFilename('')
      setNewSiteDomain('example.com')
      setNewSiteParam('3000')

      alert('Đã tạo và reload cấu hình site mới thành công!')
    } catch (e: any) {
      alert('Lỗi tạo cấu hình: ' + e.message)
    } finally {
      setCreatingSite(false)
    }
  }

  const handleDeleteSite = async (filename: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình site "${filename}" không?`)) {
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
      alert(`Đã xóa cấu hình site "${filename}" và reload Nginx thành công!`)
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
      setInstallLog(prev => prev + 'Đang cập nhật danh sách gói (apt-get update)...\n')
      await exec('sudo apt-get update')

      setInstallLog(prev => prev + 'Đang cài đặt Nginx...\n')
      const res = await exec('sudo apt-get install -y nginx')

      if (res.code === 0) {
        setInstallLog(prev => prev + 'Khởi chạy dịch vụ Nginx...\n')
        await exec('sudo systemctl start nginx && sudo systemctl enable nginx')
        alert('Cài đặt Nginx thành công!')
      } else {
        throw new Error(res.stderr || 'Lỗi cài đặt thất bại.')
      }
      await loadData()
    } catch (e: any) {
      setInstallLog(prev => prev + `Lỗi: ${e.message}\n`)
      alert('Lỗi cài đặt Nginx: ' + e.message)
    } finally {
      setInstalling(false)
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchNginx()
    setSelectedNginxFile(null)
    setNginxTestResult(null)
    setLoading(false)
  }, [fetchNginx, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {!nginxInstalled ? (
        <div className="flex-grow flex flex-col items-center justify-center text-[#585b70] max-w-md mx-auto p-6 text-center space-y-4">
          <FileCode size={48} className="text-[#89b4fa] opacity-60 animate-bounce" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#cdd6f4]">Nginx chưa được cài đặt hoặc chưa khởi động</h3>
            <p className="text-xs text-[#585b70]">
              Không tìm thấy lệnh nginx trên máy chủ SSH này. Bạn có thể tự động cài đặt Nginx thông qua trình quản lý gói của hệ thống.
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
          <div className="w-56 min-w-56 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
            <div className="px-3 py-2 bg-[#11111b]/50 border-b border-white/[0.04] text-[10px] font-semibold text-[#585b70] uppercase tracking-wider flex justify-between items-center">
              <span>Virtual Hosts</span>
              <button
                onClick={() => setShowCreateSiteModal(true)}
                className="p-1 hover:bg-white/5 rounded text-[#89b4fa] transition-all"
                title="Thêm Site Config mới"
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
              {nginxFiles.length === 0 ? (
                <div className="text-center text-[#585b70] text-[10px] py-6">Không tìm thấy file config nào.</div>
              ) : (
                nginxFiles.map((file) => (
                  <div key={file} className="group flex items-center justify-between px-1 rounded-lg hover:bg-white/[0.02]">
                    <button
                      onClick={() => handleReadNginxFile(file)}
                      className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all truncate ${
                        selectedNginxFile === file ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#a6adc8]'
                      }`}
                    >
                      <FileCode size={12} className="shrink-0 text-[#89b4fa]" />
                      <span className="truncate">{file}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSite(file)
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/5 text-[#f38ba8] transition-all shrink-0 mr-1"
                      title="Xóa Site"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowNginxWizard(true)}
                      className="px-3 py-1 rounded bg-[#fab387] text-[#1e1e2e] text-xs font-semibold hover:bg-[#f8a060] active:scale-95 transition-all"
                    >
                      Mẫu Cấu Hình
                    </button>
                    <button
                      onClick={handleSaveNginxConfig}
                      disabled={savingNginx}
                      className="px-3 py-1 rounded bg-[#89b4fa] text-[#1e1e2e] text-xs font-semibold hover:bg-[#74c7ec] active:scale-95 disabled:opacity-40 transition-all"
                    >
                      {savingNginx ? 'Đang Lưu...' : 'Lưu Config'}
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
                    className={`p-3 border-t text-[11px] font-mono flex items-start gap-2 ${
                      nginxTestResult.success
                        ? 'bg-[#a6e3a1]/5 border-[#a6e3a1]/25 text-[#a6e3a1]'
                        : 'bg-[#f38ba8]/5 border-[#f38ba8]/25 text-[#f38ba8]'
                    }`}
                  >
                    {nginxTestResult.success ? (
                      <CheckCircle size={14} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 overflow-auto whitespace-pre-wrap max-h-24">{nginxTestResult.message}</div>
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

      {/* Nginx Config Wizard Modal */}
      {showNginxWizard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowNginxWizard(false)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Nginx Config Wizard</h3>
              <button onClick={() => setShowNginxWizard(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Loại mẫu (Template Type)</label>
                <select
                  id="nginx_type_select"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                  defaultValue="proxy"
                >
                  <option value="proxy">Reverse Proxy (Node.js/Python...)</option>
                  <option value="static">Static Site (React/Vue/HTML...)</option>
                  <option value="redirect">Redirect HTTP to HTTPS</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên miền (Server Name)</label>
                <input
                  type="text"
                  id="nginx_domain_input"
                  placeholder="example.com www.example.com"
                  defaultValue="example.com"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tham số phụ (Port hoặc Thư mục gốc)</label>
                <input
                  type="text"
                  id="nginx_param_input"
                  placeholder="3000 (cho proxy) hoặc /var/www/html (cho static)"
                  defaultValue="3000"
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowNginxWizard(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const type = (document.getElementById('nginx_type_select') as HTMLSelectElement).value
                    const domain = (document.getElementById('nginx_domain_input') as HTMLInputElement).value
                    const param = (document.getElementById('nginx_param_input') as HTMLInputElement).value

                    let generated = ''
                    if (type === 'proxy') {
                      generated = `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${param};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`
                    } else if (type === 'static') {
                      generated = `server {
    listen 80;
    server_name ${domain};
    root ${param};
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }
}`
                    } else {
                      generated = `server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}`
                    }
                    setNginxConfigContent(generated)
                    setShowNginxWizard(false)
                  }}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all"
                >
                  Sinh cấu hình
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Site Modal */}
      {showCreateSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateSiteModal(false)}>
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[420px] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <Plus size={13} className="text-[#89b4fa]" /> Tạo Site Config Nginx mới
              </h3>
              <button onClick={() => setShowCreateSiteModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên file cấu hình (Filename) *</label>
                <input
                  type="text"
                  placeholder="ví dụ: myapp.conf"
                  value={newSiteFilename}
                  onChange={(e) => setNewSiteFilename(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Loại cấu hình (Site Type)</label>
                <select
                  value={newSiteType}
                  onChange={(e) => {
                    setNewSiteType(e.target.value)
                    if (e.target.value === 'static') {
                      setNewSiteParam('/var/www/html')
                    } else if (e.target.value === 'proxy') {
                      setNewSiteParam('3000')
                    } else {
                      setNewSiteParam('')
                    }
                  }}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                >
                  <option value="proxy">Reverse Proxy (Node.js/Python...)</option>
                  <option value="static">Static Site (React/Vue/HTML...)</option>
                  <option value="redirect">Redirect HTTP to HTTPS</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Tên miền (Server Name) *</label>
                <input
                  type="text"
                  placeholder="ví dụ: app.yourdomain.com"
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                />
              </div>

              {newSiteType !== 'redirect' && (
                <div className="space-y-1.5">
                  <label className="text-[#585b70] font-semibold">
                    {newSiteType === 'proxy' ? 'Cổng ứng dụng (Port) *' : 'Thư mục gốc (Root Path) *'}
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
                        placeholder="/var/www/myapp/dist"
                        value={newSiteParam}
                        onChange={(e) => setNewSiteParam(e.target.value)}
                        className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPicker(true)}
                        className="px-3 rounded-lg bg-white/5 text-[#cdd6f4] hover:bg-white/10 text-xs flex items-center justify-center"
                        title="Chọn Thư Mục"
                      >
                        Duyệt...
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSiteModal(false)}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCreateSiteFromModal}
                  disabled={creatingSite}
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] active:scale-95 transition-all disabled:opacity-40"
                >
                  {creatingSite ? 'Đang tạo...' : 'Tạo & Lưu'}
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
