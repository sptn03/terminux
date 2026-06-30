import { useState } from 'react'
import { Code2, Settings, Wifi, Send, Radio, X } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useTerminalStore } from '../../stores/terminal-store'

export default function Toolbar() {
  const toggleSnippets = useSettingsStore((s) => s.toggleSnippets)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const removeTab = useTerminalStore((s) => s.removeTab)
  const activeTab = tabs.find((t) => t.sessionId === activeTabId)
  const updateTabState = useTerminalStore((s) => s.updateTabState)

  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastCmd, setBroadcastCmd] = useState('')

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastCmd.trim()) return

    const connectedTabs = tabs.filter(t => t.connected)
    if (connectedTabs.length === 0) {
      alert('Không có tab SSH nào đang kết nối!')
      return
    }

    connectedTabs.forEach(t => {
      window.api.ssh.shellInput(t.sessionId, broadcastCmd + '\n')
    })

    setBroadcastCmd('')
    setShowBroadcast(false)
  }

  return (
    <div className="h-8 bg-[#11111b] border-b border-white/[0.04] flex items-center px-2 gap-0.5 select-none">



      {/* View Mode Toggle: Terminal vs Dashboard */}
      {activeTab && activeTab.connected && (
        <div className="flex items-center bg-[#1e1e2e]/50 border border-white/[0.04] rounded-lg p-[1px] ml-1 mr-2">
          <button
            onClick={() => updateTabState(activeTab.sessionId, { viewMode: 'terminal' })}
            className={`px-2 py-0.5 rounded-md text-[9px] transition-all font-semibold uppercase tracking-wider ${
              activeTab.viewMode !== 'dashboard'
                ? 'bg-accent-blue text-[#1e1e2e]'
                : 'text-surface-mid hover:text-surface-light'
            }`}
          >
            Terminal
          </button>
          <button
            onClick={() => updateTabState(activeTab.sessionId, { viewMode: 'dashboard' })}
            className={`px-2 py-0.5 rounded-md text-[9px] transition-all font-semibold uppercase tracking-wider ${
              activeTab.viewMode === 'dashboard'
                ? 'bg-accent-blue text-[#1e1e2e]'
                : 'text-surface-mid hover:text-surface-light'
            }`}
          >
            Dashboard
          </button>
        </div>
      )}

      {/* Broadcaster toggle */}
      {tabs.filter(t => t.connected).length > 0 && (
        <div className="flex items-center gap-0.5 mr-1">
          <button
            onClick={() => setShowBroadcast(!showBroadcast)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${
              showBroadcast ? 'bg-[#f5e0dc]/10 text-[#f5e0dc]' : 'text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.04]'
            }`}
            title="Gửi lệnh đồng thời tới tất cả các tab đang kết nối"
          >
            <Radio size={11} className={showBroadcast ? 'animate-pulse' : ''} />
            Broadcaster
          </button>

          {showBroadcast && (
            <form onSubmit={handleBroadcastSubmit} className="flex items-center gap-1.5 bg-[#181825] border border-white/5 rounded px-2 py-0.5 ml-1 animate-fade-in">
              <input
                type="text"
                placeholder="Gửi lệnh..."
                value={broadcastCmd}
                onChange={(e) => setBroadcastCmd(e.target.value)}
                className="w-32 bg-transparent text-[9px] text-[#cdd6f4] outline-none placeholder-[#585b70]"
                autoFocus
              />
              <button type="submit" className="text-[#89b4fa] hover:text-[#74c7ec]" title="Gửi (Enter)">
                <Send size={10} />
              </button>
              <button type="button" onClick={() => setShowBroadcast(false)} className="text-[#585b70] hover:text-[#cdd6f4]">
                <X size={10} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Spacer — đẩy Snippets + Settings sang phải */}
      <div className="flex-1" />

      {/* Snippets toggle */}
      <button
        onClick={toggleSnippets}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.04] transition-all"
        title="Snippets"
      >
        <Code2 size={11} />
        Snippets
      </button>

      {/* Settings */}
      <button
        onClick={toggleSettings}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.04] transition-all"
        title="Settings"
      >
        <Settings size={11} />
        Settings
      </button>

    </div>
  )
}
