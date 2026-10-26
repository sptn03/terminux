import { useRef, useEffect, useState, useCallback } from 'react'
import { WifiOff, RefreshCw, Key } from 'lucide-react'
import { useTerminal } from '../../hooks/use-terminal'
import { useTerminalStore } from '../../stores/terminal-store'

interface TerminalTabProps {
  sessionId: string | null
  hostId: string
  connected: boolean
}

// 1.5s → 3s → 6s → 12s → 20s. After the last retry the overlay stays manual.
const AUTO_RETRY_DELAYS = [1500, 3000, 6000, 12000, 20000]

export default function TerminalTab({ sessionId, hostId, connected }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [autoNotice, setAutoNotice] = useState('')
  const busyRef = useRef(false)
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tab = useTerminalStore((s) => s.tabs.find((t) => t.sessionId === sessionId))

  const terminal = useTerminal({
    sessionId,
    containerRef
  })

  const clearAutoTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const doConnect = useCallback(
    async (auto: boolean): Promise<boolean> => {
      if (!sessionId || busyRef.current) return false

      const state = useTerminalStore.getState()
      const current = state.tabs.find((t) => t.sessionId === sessionId)
      if (!current || !current.config) return false
      if (current.config.authMethod === 'password' && !current.config.password) return false

      busyRef.current = true
      setReconnecting(true)
      state.updateTabState(sessionId, { loading: true, connected: false })

      terminal.clear()
      terminal.writeln(
        auto
          ? `\r\nĐang tự động kết nối lại (lần ${Math.min(attemptsRef.current, AUTO_RETRY_DELAYS.length)}/${AUTO_RETRY_DELAYS.length})...\r\n`
          : '\r\nĐang kết nối lại...\r\n'
      )

      try {
        // Close the dead session server-side so the id can be reused safely.
        await window.api.ssh.disconnect(sessionId).catch(() => {})

        const result = await window.api.ssh.connect({ ...current.config, sessionId })

        if (result.error) {
          const isAuthError =
            result.error.toLowerCase().includes('auth') ||
            result.error.toLowerCase().includes('unauthorized') ||
            result.error.toLowerCase().includes('fail')

          state.updateTabState(sessionId, {
            connected: false,
            loading: false,
            label: `${current.label.replace(' (error)', '')} (error)`,
            config: isAuthError ? { ...current.config, password: '' } : current.config
          })
          return false
        }

        attemptsRef.current = 0
        setAutoNotice('')
        state.updateTabState(sessionId, {
          connected: true,
          loading: false,
          label: current.label.replace(' (error)', '')
        })
        return true
      } catch (err: any) {
        state.updateTabState(sessionId, {
          connected: false,
          loading: false,
          label: `${current.label.replace(' (error)', '')} (error)`
        })
        return false
      } finally {
        busyRef.current = false
        setReconnecting(false)
      }
    },
    // Terminal helpers close over a ref internally, so they stay valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId]
  )

  const scheduleAutoReconnect = useCallback(() => {
    clearAutoTimer()

    const current = useTerminalStore.getState().tabs.find((t) => t.sessionId === sessionId)
    if (!current || !current.config) return
    if (current.config.authMethod === 'password' && !current.config.password) return

    const attempt = attemptsRef.current
    if (attempt >= AUTO_RETRY_DELAYS.length) {
      setAutoNotice('Đã thử tự động kết nối lại nhiều lần nhưng không thành công. Nhấn "Kết nối lại" để thử lại.')
      return
    }

    const delay = AUTO_RETRY_DELAYS[attempt]
    setAutoNotice(
      `Mất kết nối. Tự động thử lại sau ${Math.round(delay / 1000)} giây (lần ${attempt + 1}/${AUTO_RETRY_DELAYS.length})...`
    )

    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      attemptsRef.current += 1
      const ok = await doConnect(true)
      if (!ok) scheduleAutoReconnect()
    }, delay)
  }, [clearAutoTimer, doConnect, sessionId])

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

  // Auto-reconnect whenever the SSH session is lost unexpectedly.
  useEffect(() => {
    const onLost = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string; code: number | null }>).detail
      if (detail?.sessionId !== sessionId) return
      // `exit` typed by the user returns 0 — do not reopen against their intent.
      if (detail.code === 0) {
        setAutoNotice('Phiên đã kết thúc. Nhấn "Kết nối lại" nếu bạn muốn mở lại.')
        return
      }
      attemptsRef.current = 0
      scheduleAutoReconnect()
    }
    window.addEventListener('terminux:connection-lost', onLost)
    return () => {
      window.removeEventListener('terminux:connection-lost', onLost)
      clearAutoTimer()
    }
  }, [sessionId, scheduleAutoReconnect, clearAutoTimer])

  // Reset retry state once a connection succeeds.
  useEffect(() => {
    if (!tab?.connected) return
    attemptsRef.current = 0
    setAutoNotice('')
    clearAutoTimer()
  }, [tab?.connected, clearAutoTimer])

  const handleReconnect = async () => {
    clearAutoTimer()
    attemptsRef.current = 0
    setAutoNotice('')
    await doConnect(false)
  }

  const cancelAutoReconnect = () => {
    clearAutoTimer()
    attemptsRef.current = AUTO_RETRY_DELAYS.length
    setAutoNotice('Đã dừng tự động kết nối lại. Nhấn "Kết nối lại" khi bạn muốn thử lại.')
  }

  const handleConnectWithPassword = async () => {
    if (!tab || !tab.config || !sessionId || busyRef.current) return

    clearAutoTimer()
    attemptsRef.current = 0
    setAutoNotice('')

    const updatedConfig = { ...tab.config, password: passwordInput }
    useTerminalStore.getState().updateTabState(sessionId, { config: updatedConfig })

    const ok = await doConnect(false)
    if (ok) setPasswordInput('')
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
            <p className="text-xs text-surface-mid mb-3">
              Phiên kết nối SSH đã kết thúc hoặc không thể thiết lập.
            </p>
            {autoNotice && (
              <p className="text-[11px] text-accent-blue/80 bg-accent-blue/5 border border-accent-blue/10 rounded-lg px-3 py-2 mb-4">
                {autoNotice}
              </p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleReconnect}
                disabled={reconnecting}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-blue text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={12} className={reconnecting ? 'animate-spin' : ''} />
                Kết nối lại
              </button>
              {autoNotice && !autoNotice.startsWith('Đã dừng') && (
                <button
                  onClick={cancelAutoReconnect}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay text-surface-text hover:bg-surface-soft hover:text-surface-light transition-colors active:scale-95"
                >
                  Dừng tự động
                </button>
              )}
              <button
                onClick={() => {
                  clearAutoTimer()
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
