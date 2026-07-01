import { useState, useEffect, useCallback } from 'react'
import { Bell, Trash2, Copy, Power } from 'lucide-react'

interface AlertsPanelProps {
  alertCpu: number
  setAlertCpu: (val: number) => void
  alertMem: number
  setAlertMem: (val: number) => void
  alertDisk: number
  setAlertDisk: (val: number) => void
  webhookUrl: string
  setWebhookUrl: (val: string) => void
  webhookType: string
  setWebhookType: (val: string) => void
  alertsHistory: string[]
  setLoading: (loading: boolean) => void
}

export default function AlertsPanel({
  alertCpu,
  setAlertCpu,
  alertMem,
  setAlertMem,
  alertDisk,
  setAlertDisk,
  webhookUrl,
  setWebhookUrl,
  webhookType,
  setWebhookType,
  alertsHistory,
  setLoading
}: AlertsPanelProps) {
  const [alertsEnabled, setAlertsEnabled] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const rows = await window.api.db.all("SELECT value FROM app_settings WHERE key = 'devops_alerts_enabled'")
        if (rows.length > 0) setAlertsEnabled(rows[0].value !== 'false')
      } catch {}
    })()
  }, [])

  const toggleAlerts = async (val: boolean) => {
    setAlertsEnabled(val)
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_alerts_enabled', ?)", [String(val)])
  }

  const handleCopyHistory = () => {
    navigator.clipboard.writeText(alertsHistory.join('\n'))
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Form settings */}
      <div className="w-96 min-w-96 bg-[#181825] border border-white/[0.04] rounded-xl p-4 space-y-4 overflow-y-auto scrollbar-thin">
        {/* Alerts Master Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Cấu hình Cảnh báo</span>
          <button
            onClick={() => toggleAlerts(!alertsEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              alertsEnabled
                ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]'
                : 'bg-[#f38ba8]/10 text-[#f38ba8]'
            }`}
          >
            <Power size={10} />
            {alertsEnabled ? 'Đang bật' : 'Đang tắt'}
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Ngưỡng CPU cảnh báo (%)</label>
          <input
            type="number"
            value={alertCpu}
            onChange={async (e) => {
              const val = parseInt(e.target.value) || 85
              setAlertCpu(val)
              await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_alert_cpu', ?)", [String(val)])
            }}
            className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Ngưỡng RAM cảnh báo (%)</label>
          <input
            type="number"
            value={alertMem}
            onChange={async (e) => {
              const val = parseInt(e.target.value) || 90
              setAlertMem(val)
              await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_alert_mem', ?)", [String(val)])
            }}
            className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Ngưỡng Disk cảnh báo (%)</label>
          <input
            type="number"
            value={alertDisk}
            onChange={async (e) => {
              const val = parseInt(e.target.value) || 95
              setAlertDisk(val)
              await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_alert_disk', ?)", [String(val)])
            }}
            className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
          />
        </div>

        <div className="border-t border-white/[0.04] pt-4 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] block">Webhook thông báo</span>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Loại Webhook</label>
            <select
              value={webhookType}
              onChange={async (e) => {
                setWebhookType(e.target.value)
                await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_webhook_type', ?)", [e.target.value])
              }}
              className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
            >
              <option value="slack">Slack Webhook</option>
              <option value="discord">Discord Webhook</option>
              <option value="telegram">Telegram BOT Webhook</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">Webhook URL</label>
            <input
              type="text"
              value={webhookUrl}
              placeholder="https://hooks.slack.com/services/..."
              onChange={async (e) => {
                setWebhookUrl(e.target.value)
                await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('devops_webhook_url', ?)", [e.target.value])
              }}
              className="w-full bg-[#11111b] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
            />
          </div>

          <button
            onClick={async () => {
              if (!webhookUrl) {
                alert('Vui lòng nhập Webhook URL')
                return
              }
              setLoading(true)
              try {
                let payload = {}
                if (webhookType === 'slack') {
                  payload = { text: '🚨 *[Terminux Test]* \nCấu hình Webhook của bạn hoạt động chính xác!' }
                } else {
                  payload = { content: '🚨 **[Terminux Test]** \nCấu hình Webhook của bạn hoạt động chính xác!' }
                }
                await fetch(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                })
                alert('Gửi test webhook thành công!')
              } catch (err: any) {
                alert('Lỗi gửi Webhook: ' + err.message)
              }
              setLoading(false)
            }}
            className="w-full py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
          >
            Test Webhook Connection
          </button>
        </div>
      </div>

      {/* History logs of alerts */}
      <div className="flex-1 bg-[#11111b] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase font-semibold text-[#585b70] tracking-wider">
            Nhật ký cảnh báo hệ thống
            {alertsHistory.length > 0 && (
              <span className="ml-2 bg-[#f38ba8]/20 text-[#f38ba8] px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                {alertsHistory.length}
              </span>
            )}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={handleCopyHistory}
              className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              title="Copy tất cả"
            >
              <Copy size={11} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs text-[#a6adc8]">
          {alertsHistory.map((h, i) => (
            <div key={i} className="p-2 border-b border-white/[0.02] text-[#f38ba8] hover:bg-white/[0.01]">
              {h}
            </div>
          ))}
          {alertsHistory.length === 0 && <div className="text-[#585b70] text-center py-8">Chưa ghi nhận sự cố quá tải nào.</div>}
        </div>
      </div>
    </div>
  )
}
