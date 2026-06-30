import { X, Loader2, Wifi, WifiOff } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'

export default function TabBar() {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const removeTab = useTerminalStore((s) => s.removeTab)

  if (tabs.length === 0) return null

  return (
    <div className="flex h-9 bg-[#11111b] border-b border-white/[0.04] overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.sessionId === activeTabId
        return (
          <div
            key={tab.sessionId}
            onClick={() => setActiveTab(tab.sessionId)}
            className={`group relative flex items-center gap-2 px-3.5 py-1.5 text-xs border-r border-white/[0.04] cursor-pointer whitespace-nowrap select-none transition-all ${
              isActive
                ? tab.alertStatus === 'danger' ? 'bg-[#f38ba8]/10 text-[#f38ba8]' : 'bg-[#1e1e2e] text-[#cdd6f4]'
                : tab.alertStatus === 'danger' ? 'bg-[#f38ba8]/5 text-[#f38ba8]/70 hover:bg-[#f38ba8]/10' : 'bg-[#11111b] text-[#45475a] hover:text-[#a6adc8] hover:bg-white/[0.02]'
            }`}
          >
            {/* Active indicator */}
            {isActive && (
              <span className={`absolute inset-x-2.5 top-0 h-[2px] rounded-full bg-gradient-to-r ${
                tab.alertStatus === 'danger' ? 'from-[#f38ba8] to-[#fab387]' : 'from-[#89b4fa] to-[#cba6f7]'
              } animate-slide-in`} />
            )}

            {tab.loading ? (
              <div className="w-2.5 h-2.5 rounded-full bg-[#89b4fa] animate-pulse-dot" />
            ) : tab.connected ? (
              tab.alertStatus === 'danger' ? (
                <div className="w-2 h-2 rounded-full bg-[#f38ba8] animate-pulse shadow-[0_0_8px_#f38ba8]" title="⚠️ Cảnh báo: Tài nguyên quá tải!" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-[#a6e3a1] shadow-[0_0_6px_rgba(166,227,161,0.3)]" />
              )
            ) : (
              <div className="w-2 h-2 rounded-full bg-[#585b70]" />
            )}
            <span className="max-w-[100px] truncate">{tab.label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeTab(tab.sessionId); window.api.ssh.disconnect(tab.sessionId) }}
              className="p-0.5 rounded-[4px] text-[#45475a] hover:text-[#cdd6f4] opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
