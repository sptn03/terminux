import { useEffect, useRef, useState, useMemo } from 'react'
import { Terminal, Plug, FolderTree, ClipboardList, ArrowRight, File, FolderOpen, Wifi } from 'lucide-react'
import Sidebar from './components/layout/Sidebar'
import TitleBar from './components/layout/TitleBar'
import TabBar from './components/layout/TabBar'
import Toolbar from './components/layout/Toolbar'
import TerminalTab from './components/terminal/TerminalTab'
import DevOpsDashboard from './components/devops/DevOpsDashboard'
import SnippetPanel from './components/snippet/SnippetPanel'
import SettingsModal from './components/settings/SettingsModal'
import { useHostStore } from './stores/host-store'
import { useSnippetStore } from './stores/snippet-store'
import { useSettingsStore } from './stores/settings-store'
import { useTerminalStore } from './stores/terminal-store'

export default function App() {
  const loadHosts = useHostStore((s) => s.loadHosts)
  const loadGroups = useHostStore((s) => s.loadGroups)
  const loadSnippets = useSnippetStore((s) => s.loadSnippets)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const removeTab = useTerminalStore((s) => s.removeTab)
  const toggleSnippets = useSettingsStore((s) => s.toggleSnippets)
  const backgroundImage = useSettingsStore((s) => s.backgroundImage)
  const backgroundBlur = useSettingsStore((s) => s.backgroundBlur)
  const opacity = useSettingsStore((s) => s.opacity)

  // Background images either live behind a URL or on the server filesystem,
  // which is served through /api/file.
  const bgSrc = useMemo(() => {
    if (!backgroundImage) return ''
    if (backgroundImage.startsWith('http://') || backgroundImage.startsWith('https://')) return backgroundImage
    if (backgroundImage.startsWith('/api/')) return backgroundImage
    const normalized = backgroundImage.replace(/^file:\/\//, '').replace(/\\/g, '/')
    return `/api/file?path=${encodeURIComponent(normalized)}`
  }, [backgroundImage])

  const quickConnectRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([loadHosts(), loadGroups(), loadSnippets(), loadSettings()])
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Ctrl+` → focus quick connect
      if (e.key === '`') {
        e.preventDefault()
        // Find the quick connect input
        const qc = document.querySelector<HTMLInputElement>('[data-qc]')
        qc?.focus()
        qc?.select()
        return
      }

      // Ctrl+W → close active tab
      if (e.key === 'w' && activeTabId) {
        e.preventDefault()
        removeTab(activeTabId)
        window.api.ssh.disconnect(activeTabId)
        return
      }

      // Ctrl+Tab → next tab, Ctrl+Shift+Tab → prev tab
      if (e.key === 'Tab' && tabs.length > 1) {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.sessionId === activeTabId)
        if (e.shiftKey) {
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].sessionId)
        } else {
          setActiveTab(tabs[(idx + 1) % tabs.length].sessionId)
        }
        return
      }

      // Ctrl+B → toggle snippets panel
      if (e.key === 'b') {
        e.preventDefault()
        toggleSnippets()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, tabs, removeTab, setActiveTab, toggleSnippets])

  return (
    <div className="flex h-screen bg-[#11111b]">
      {/* Background: image or subtle glow */}
      {backgroundImage ? (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <img src={bgSrc} alt=""
            className="w-full h-full object-cover"
            style={{ filter: `blur(${backgroundBlur}px)`, opacity: opacity }} />
          <div className="absolute inset-0 bg-[#11111b]/70" />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-[#89b4fa]/[0.03] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#cba6f7]/[0.02] rounded-full blur-[100px]" />
        </div>
      )}

      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden relative">
        <TitleBar />
        <Toolbar />
        <TabBar />
        <div className="flex flex-1 overflow-hidden">
          {tabs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center select-none p-12 animate-fade-in">
              <div className="max-w-sm w-full text-center">
                {/* Hero */}
                <div className="relative mx-auto mb-8 w-fit">
                  <div className="w-20 h-20 rounded-[18px] bg-gradient-to-br from-[#89b4fa] to-[#cba6f7] p-[1px]">
                    <div className="w-full h-full rounded-[17px] bg-[#1e1e2e] flex items-center justify-center">
                      <Terminal size={32} className="text-[#89b4fa]" />
                    </div>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#a6e3a1] flex items-center justify-center shadow-lg shadow-[#a6e3a1]/20 ring-[2px] ring-[#11111b]">
                    <span className="text-[9px] font-bold text-[#11111b]">✓</span>
                  </div>
                </div>

                <h1 className="text-xl font-bold tracking-tight mb-1.5">Terminux</h1>
                <p className="text-sm text-[#585b70] leading-relaxed max-w-xs mx-auto">
                  SSH client của riêng bạn — gọn nhẹ, nhanh, cá nhân hoá
                </p>

                {/* Feature grid */}
                <div className="mt-8 grid grid-cols-3 gap-2.5">
                  {[
                    { icon: Plug, label: 'Connect', desc: 'SSH terminal', color: '#89b4fa' },
                    { icon: FolderTree, label: 'Organize', desc: 'Host groups', color: '#a6e3a1' },
                    { icon: ClipboardList, label: 'Snippets', desc: 'Fast commands', color: '#f9e2af' },
                  ].map(({ icon: Icon, label, desc, color }) => (
                    <div key={label} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3.5 text-center card-lift">
                      <Icon size={16} className="mx-auto mb-2" style={{ color }} />
                      <div className="text-[11px] font-medium text-[#a6adc8]">{label}</div>
                      <div className="text-[10px] text-[#45475a] mt-0.5">{desc}</div>
                    </div>
                  ))}
                </div>

                {/* Hint */}
                <div className="mt-10 flex items-center justify-center gap-2 text-xs text-[#45475a]">
                  <span>Gõ</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] font-mono text-[10px] text-[#585b70] leading-none">user@host</kbd>
                  <ArrowRight size={11} className="text-[#313244]" />
                  <span>kết nối nhanh</span>
                </div>
              </div>
            </div>
          ) : (
            tabs.map((tab) => (
              <div key={tab.sessionId}
                className={`flex-1 flex-col min-w-0 ${tab.sessionId === activeTabId ? 'flex animate-fade-in' : 'hidden'}`}>
                <div className={`flex-1 ${tab.viewMode === 'dashboard' ? 'hidden' : 'flex'}`}>
                  <TerminalTab sessionId={tab.sessionId} hostId={tab.hostId} connected={tab.connected} />
                </div>
                {tab.viewMode === 'dashboard' && (
                  <DevOpsDashboard sessionId={tab.sessionId} />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <SnippetPanel />
      <SettingsModal />
    </div>
  )
}
