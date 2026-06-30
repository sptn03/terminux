import { useRef, useEffect, useState } from 'react'
import { WifiOff, RefreshCw, Key } from 'lucide-react'
import { useTerminal } from '../../hooks/use-terminal'
import { useTerminalStore } from '../../stores/terminal-store'

interface TerminalTabProps {
  sessionId: string | null
  hostId: string
  connected: boolean
}

export default function TerminalTab({ sessionId, hostId, connected }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const tab = useTerminalStore((s) => s.tabs.find((t) => t.sessionId === sessionId))

  const terminal = useTerminal({
    sessionId,
    containerRef
  })

  // Fit on mount and when tab becomes visible
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [sessionId])

  // Fit when container changes size
  useEffect(() => {
    if (!containerRef.current) return

    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [sessionId])

  const handleReconnect = async () => {
    if (!tab || !tab.config || reconnecting || !sessionId) return

    if (tab.config.authMethod === 'password' && !tab.config.password) {
      const updateTabState = useTerminalStore.getState().updateTabState
      updateTabState(sessionId, { loading: false, connected: false })
      return
    }

    setReconnecting(true)
    terminal.clear()
    terminal.writeln('Đang kết nối lại...\r\n')

    const updateTabState = useTerminalStore.getState().updateTabState
    updateTabState(sessionId, { loading: true, connected: false })

    const result = await window.api.ssh.connect(tab.config)

    if (result.error) {
      const isAuthError = result.error.toLowerCase().includes('auth') || result.error.toLowerCase().includes('unauthorized') || result.error.toLowerCase().includes('fail')
      const nextConfig = isAuthError ? { ...tab.config, password: '' } : tab.config

      updateTabState(sessionId, {
        connected: false,
        loading: false,
        label: `${tab.label.replace(' (error)', '')} (error)`,
        config: nextConfig
      })
    } else {
      updateTabState(sessionId, {
        connected: true,
        loading: false,
        label: tab.label.replace(' (error)', '')
      })
    }
    setReconnecting(false)
  }

  const handleConnectWithPassword = async () => {
    if (!tab || !tab.config || reconnecting || !sessionId) return
    setReconnecting(true)

    terminal.clear()
    terminal.writeln('Đang kết nối...\r\n')

    const updateTabState = useTerminalStore.getState().updateTabState
    updateTabState(sessionId, { loading: true, connected: false })

    const password = passwordInput
    const updatedConfig = { ...tab.config, password }
    updateTabState(sessionId, { config: updatedConfig })

    const result = await window.api.ssh.connect({ ...tab.config, password })

    if (result.error) {
      const isAuthError = result.error.toLowerCase().includes('auth') || result.error.toLowerCase().includes('unauthorized') || result.error.toLowerCase().includes('fail')
      const nextConfig = isAuthError ? { ...updatedConfig, password: '' } : updatedConfig

      updateTabState(sessionId, {
        connected: false,
        loading: false,
        label: `${tab.label.replace(' (error)', '')} (error)`,
        config: nextConfig
      })
    } else {
      updateTabState(sessionId, {
        connected: true,
        loading: false,
        label: tab.label.replace(' (error)', '')
      })
    }
    setReconnecting(false)
    setPasswordInput('')
  }

  const isPasswordRequired = tab && tab.config && tab.config.authMethod === 'password' && !tab.config.password
  const showPrompt = tab && !tab.connected && !tab.loading && isPasswordRequired
  const showReconnectOverlay = tab && !tab.connected && !tab.loading && !isPasswordRequired

  return (
    <div className="flex-1 flex flex-col relative h-full overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden terminal-container"
        style={{ height: '100%' }}
      />

      {/* Password Prompt Overlay */}
      {showPrompt && (
        <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-fade-in">
          <div className="bg-surface-crust border border-surface-overlay rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center mx-auto mb-4">
              <Key className="text-accent-blue" size={20} />
            </div>
            <h3 className="text-sm font-semibold text-surface-light mb-1 text-center">Yêu cầu xác thực</h3>
            <p className="text-xs text-surface-mid mb-4 text-center">
              Nhập mật khẩu để kết nối tới <span className="font-mono text-accent-blue">{tab.config.username}@{tab.config.host}</span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleConnectWithPassword()
              }}
              className="space-y-4"
            >
              <input
                type="password"
                placeholder="Mật khẩu"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                className="w-full bg-surface-base border border-surface-overlay rounded-lg px-3 py-2 text-xs text-surface-light outline-none focus:border-accent-blue/50"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (sessionId) {
                      useTerminalStore.getState().removeTab(sessionId)
                      window.api.ssh.disconnect(sessionId)
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay text-surface-text hover:bg-surface-soft hover:text-surface-light transition-colors active:scale-95"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-blue text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors active:scale-95"
                >
                  Kết nối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reconnect Overlay */}
      {showReconnectOverlay && (
        <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-fade-in">
          <div className="bg-surface-crust border border-surface-overlay rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center mx-4 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-accent-red/10 flex items-center justify-center mx-auto mb-4">
              <WifiOff className="text-accent-red" size={20} />
            </div>
            <h3 className="text-sm font-semibold text-surface-light mb-1">Kết nối đã đóng</h3>
            <p className="text-xs text-surface-mid mb-5">
              Phiên kết nối SSH đã kết thúc hoặc không thể thiết lập.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleReconnect}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-blue text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw size={12} className={reconnecting ? 'animate-spin' : ''} />
                Kết nối lại
              </button>
              <button
                onClick={() => {
                  if (sessionId) {
                    useTerminalStore.getState().removeTab(sessionId)
                    window.api.ssh.disconnect(sessionId)
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay text-surface-text hover:bg-surface-soft hover:text-surface-light transition-colors active:scale-95"
              >
                Đóng Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
