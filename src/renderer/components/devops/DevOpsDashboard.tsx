import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity,
  Layers,
  Settings,
  FolderOpen,
  RefreshCw,
  Box,
  Database,
  Terminal,
  ArrowRight,
  Server,
  Clock,
  Send,
  Package,
  Bell,
  DownloadCloud
} from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'
import SftpPanel from '../sftp/SftpPanel'
import TunnelPanel from '../tunnel/TunnelPanel'

import OverviewPanel from './OverviewPanel'
import ProcessesPanel from './ProcessesPanel'
import PM2Panel from './PM2Panel'
import DockerPanel from './DockerPanel'
import DatabasePanel from './DatabasePanel'
import CronPanel from './CronPanel'
import PackagesPanel from './PackagesPanel'
import LogsPanel from './LogsPanel'
import ServicesPanel from './ServicesPanel'
import NginxPanel from './NginxPanel'
import AlertsPanel from './AlertsPanel'
import BackupPanel from './BackupPanel'

interface DevOpsDashboardProps {
  sessionId: string
}

export default function DevOpsDashboard({ sessionId }: DevOpsDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    | 'overview'
    | 'pm2'
    | 'services'
    | 'nginx'
    | 'docker'
    | 'logs'
    | 'database'
    | 'sftp'
    | 'tunnel'
    | 'processes'
    | 'cron'
    | 'multiexec'
    | 'packages'
    | 'alerts'
    | 'backup'
  >('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Alerts config settings
  const [alertCpu, setAlertCpu] = useState(85)
  const [alertMem, setAlertMem] = useState(90)
  const [alertDisk, setAlertDisk] = useState(95)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookType, setWebhookType] = useState('slack')
  const [alertsHistory, setAlertsHistory] = useState<string[]>([])

  const lastAlertTimeRef = useRef<number>(0)

  const triggerResourceAlert = useCallback(
    async (cpu: number, mem: number, disk: number) => {
      const now = Date.now()
      if (now - lastAlertTimeRef.current < 5 * 60 * 1000) return // Throttle 5 mins
      lastAlertTimeRef.current = now

      const message = `Cảnh báo máy chủ: CPU: ${cpu.toFixed(1)}% (ngưỡng ${alertCpu}%), RAM: ${mem.toFixed(
        1
      )}% (ngưỡng ${alertMem}%), DISK: ${disk.toFixed(1)}% (ngưỡng ${alertDisk}%)`
      setAlertsHistory((prev) => [new Date().toLocaleTimeString() + ' - ' + message, ...prev].slice(0, 20))

      // 1. Desktop notification
      if (Notification.permission === 'granted') {
        new Notification('Terminux Alert', { body: message })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') new Notification('Terminux Alert', { body: message })
        })
      }

      // 2. Webhook
      if (webhookUrl) {
        try {
          let payload = {}
          if (webhookType === 'slack') {
            payload = { text: `🚨 *[Terminux Alert]* \n${message}` }
          } else if (webhookType === 'discord') {
            payload = { content: `🚨 **[Terminux Alert]** \n${message}` }
          } else {
            // telegram
            payload = { text: `🚨 [Terminux Alert] \n${message}` }
          }
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        } catch (err: any) {
          console.error('Lỗi gửi Webhook:', err.message)
        }
      }
    },
    [alertCpu, alertMem, alertDisk, webhookUrl, webhookType]
  )

  const fetchAlertSettings = useCallback(async () => {
    try {
      const rows = await window.api.db.all(
        "SELECT * FROM app_settings WHERE key LIKE 'devops_alert_%' OR key = 'devops_webhook_url' OR key = 'devops_webhook_type'"
      )
      const map: Record<string, string> = {}
      rows.forEach((r) => {
        map[r.key] = r.value
      })
      if (map['devops_alert_cpu']) setAlertCpu(parseInt(map['devops_alert_cpu']))
      if (map['devops_alert_mem']) setAlertMem(parseInt(map['devops_alert_mem']))
      if (map['devops_alert_disk']) setAlertDisk(parseInt(map['devops_alert_disk']))
      if (map['devops_webhook_url']) setWebhookUrl(map['devops_webhook_url'])
      if (map['devops_webhook_type']) setWebhookType(map['devops_webhook_type'])
    } catch {}
  }, [])

  useEffect(() => {
    fetchAlertSettings()
  }, [fetchAlertSettings])

  const exec = useCallback(
    async (cmd: string) => {
      try {
        const result = await window.api.ssh.exec(sessionId, cmd)
        return result
      } catch (err: any) {
        return { stdout: '', stderr: err.message || 'Execution failed', code: -1 }
      }
    },
    [sessionId]
  )

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
  }

  const menuGroups = [
    {
      title: 'Hệ thống & Giám sát',
      items: [
        { id: 'overview', name: 'Overview', icon: Activity },
        { id: 'processes', name: 'Processes', icon: Activity },
        { id: 'services', name: 'Services', icon: Settings },
        { id: 'logs', name: 'Log Streamer', icon: Terminal },
        { id: 'alerts', name: 'Alerts', icon: Bell }
      ]
    },
    {
      title: 'Ứng dụng & Dịch vụ',
      items: [
        { id: 'pm2', name: 'PM2', icon: Layers },
        { id: 'docker', name: 'Docker', icon: Box },
        { id: 'nginx', name: 'Nginx', icon: FolderOpen },
        { id: 'cron', name: 'Cron Jobs', icon: Clock }
      ]
    },
    {
      title: 'Dữ liệu & Tệp tin',
      items: [
        { id: 'sftp', name: 'SFTP', icon: Server },
        { id: 'database', name: 'Database', icon: Database },
        { id: 'backup', name: 'Backup', icon: DownloadCloud }
      ]
    },
    {
      title: 'Mạng & Tiện ích',
      items: [
        { id: 'tunnel', name: 'Tunnel', icon: ArrowRight },
        { id: 'packages', name: 'Packages', icon: Package }
      ]
    }
  ] as const

  return (
    <div className="flex-grow flex-shrink flex-basis-0 min-w-0 flex flex-col bg-[#1e1e2e] text-[#cdd6f4] overflow-hidden select-none animate-fade-in">
      {/* Tab Header */}
      <div className="h-10 bg-[#181825] border-b border-white/[0.04] flex items-center px-4 justify-between shrink-0">
        <div className="flex gap-2 items-center">
          <Activity size={14} className="text-[#89b4fa]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#a6adc8]">DevOps Dashboard</span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all disabled:opacity-40 shrink-0"
          title="Tải lại dữ liệu"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sub-Sidebar */}
        <div className="w-[180px] min-w-[180px] bg-[#181825] border-r border-white/[0.04] flex flex-col p-3 overflow-y-auto scrollbar-thin gap-4 shrink-0">
          {menuGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-[#45475a] uppercase tracking-wider px-2 mb-1">
                {group.title}
              </span>
              {group.items.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveSubTab(id)
                    setError('')
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all text-left group ${
                    activeSubTab === id
                      ? 'bg-[#89b4fa]/15 text-[#89b4fa] font-bold border-l-2 border-[#89b4fa] pl-1.5'
                      : 'text-[#a6adc8] hover:text-[#cdd6f4] hover:bg-white/[0.02]'
                  }`}
                >
                  <Icon size={12} className={`shrink-0 ${activeSubTab === id ? 'text-[#89b4fa]' : 'text-[#585b70] group-hover:text-[#cdd6f4]'}`} />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {/* Main Workspace Panels */}
          <div className={`flex-1 min-w-0 overflow-hidden relative flex flex-col p-4 ${activeSubTab === 'sftp' || activeSubTab === 'tunnel' ? 'hidden' : ''}`}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e2e]/50 z-20">
                <RefreshCw size={24} className="animate-spin text-[#89b4fa]" />
              </div>
            )}

            {error && (
              <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/20 rounded-lg p-3 text-xs text-[#f38ba8] mb-3 flex items-center justify-between shrink-0">
                <span>{error}</span>
                <button onClick={() => setError('')} className="hover:text-white">
                  Close
                </button>
              </div>
            )}

            {activeSubTab === 'overview' && (
              <OverviewPanel
                sessionId={sessionId}
                exec={exec}
                refreshKey={refreshKey}
                setLoading={setLoading}
                setError={setError}
                alertCpu={alertCpu}
                alertMem={alertMem}
                alertDisk={alertDisk}
                triggerResourceAlert={triggerResourceAlert}
              />
            )}

            {activeSubTab === 'processes' && (
              <ProcessesPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'pm2' && (
              <PM2Panel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'docker' && (
              <DockerPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'database' && (
              <DatabasePanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'cron' && (
              <CronPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'packages' && (
              <PackagesPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'logs' && (
              <LogsPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'services' && (
              <ServicesPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'nginx' && (
              <NginxPanel sessionId={sessionId} exec={exec} refreshKey={refreshKey} setLoading={setLoading} setError={setError} />
            )}

            {activeSubTab === 'alerts' && (
              <AlertsPanel
                alertCpu={alertCpu}
                setAlertCpu={setAlertCpu}
                alertMem={alertMem}
                setAlertMem={setAlertMem}
                alertDisk={alertDisk}
                setAlertDisk={setAlertDisk}
                webhookUrl={webhookUrl}
                setWebhookUrl={setWebhookUrl}
                webhookType={webhookType}
                setWebhookType={setWebhookType}
                alertsHistory={alertsHistory}
                setLoading={setLoading}
              />
            )}

            {activeSubTab === 'backup' && <BackupPanel sessionId={sessionId} exec={exec} setLoading={setLoading} />}
          </div>

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
      </div>
    </div>
  )
}
