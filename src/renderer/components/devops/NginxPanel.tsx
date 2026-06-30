import { useState, useEffect, useCallback } from 'react'
import { FileCode, RefreshCw, AlertTriangle, CheckCircle, X } from 'lucide-react'

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

  const fetchNginx = useCallback(async () => {
    try {
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
                  selectedNginxFile === file ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold' : 'text-[#a6adc8] hover:bg-white/[0.02]'
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
    </div>
  )
}
