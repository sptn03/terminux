import { useState, useRef, useEffect } from 'react'
import { Plus, FolderPlus, Terminal, Settings, Code2, Search, Server, X } from 'lucide-react'
import HostTree from '../host/HostTree'
import QuickConnect from '../host/QuickConnect'
import HostForm from '../host/HostForm'
import GroupForm from '../host/GroupForm'
import { useSettingsStore } from '../../stores/settings-store'

export default function Sidebar() {
  const [showHostForm, setShowHostForm] = useState(false)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const toggleSnippets = useSettingsStore((s) => s.toggleSnippets)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addBtnRef.current && !addBtnRef.current.closest('.add-menu-container')?.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  return (
    <>
      <div
        className="bg-[#11111b] flex flex-col border-r border-white/[0.04] select-none z-10 transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          width: sidebarCollapsed ? '0px' : 'var(--sidebar-width)',
          minWidth: sidebarCollapsed ? '0px' : 'var(--sidebar-width)',
          borderRightWidth: sidebarCollapsed ? '0px' : '1px'
        }}
      >
        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-white/[0.04] gap-3">
          <div className="w-7 h-7 rounded-[10px] bg-gradient-to-br from-[#89b4fa] to-[#cba6f7] p-[1px] shadow-lg shadow-[#89b4fa]/10">
            <div className="w-full h-full rounded-[9px] bg-[#11111b] flex items-center justify-center">
              <Terminal size={13} className="text-[#89b4fa]" />
            </div>
          </div>
          <span className="text-xs font-bold text-[#cdd6f4] tracking-wide">Terminux</span>
        </div>

        <QuickConnect />

        {/* Host section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[9px] font-bold text-[#45475a] uppercase tracking-[0.14em]">
              Servers
            </span>

            {/* Add dropdown trigger */}
            <div className="relative add-menu-container">
              <button
                ref={addBtnRef}
                onClick={() => setShowAddMenu((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all active:scale-95 ${
                  showAddMenu
                    ? 'bg-[#89b4fa]/15 text-[#89b4fa]'
                    : 'text-[#45475a] hover:text-[#cdd6f4] hover:bg-white/[0.04]'
                }`}
                title="Thêm server hoặc nhóm"
              >
                <Plus size={12} className={`transition-transform duration-200 ${showAddMenu ? 'rotate-45' : ''}`} />
                Thêm
              </button>

              {/* Dropdown */}
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-[160px] bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden animate-scale-in origin-top-right">
                  <div className="px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[9px] font-bold text-[#45475a] uppercase tracking-wider">Tạo mới</span>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => { setShowHostForm(true); setShowAddMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-xs text-[#cdd6f4] transition-all active:scale-[0.98] group"
                    >
                      <div className="w-6 h-6 rounded-md bg-[#89b4fa]/10 flex items-center justify-center group-hover:bg-[#89b4fa]/20 transition-colors">
                        <Server size={12} className="text-[#89b4fa]" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">Server</div>
                        <div className="text-[9px] text-[#585b70]">Thêm máy chủ SSH</div>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowGroupForm(true); setShowAddMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-xs text-[#cdd6f4] transition-all active:scale-[0.98] group"
                    >
                      <div className="w-6 h-6 rounded-md bg-[#f9e2af]/10 flex items-center justify-center group-hover:bg-[#f9e2af]/20 transition-colors">
                        <FolderPlus size={12} className="text-[#f9e2af]" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">Nhóm</div>
                        <div className="text-[9px] text-[#585b70]">Tạo nhóm máy chủ</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="px-3 pb-2.5">
            <div className="flex items-center gap-1.5 bg-[#1e1e2e] rounded-[10px] px-2.5 py-1.5 border border-white/[0.04] focus-within:border-[#89b4fa]/25 transition-all">
              <Search size={11} className="text-[#45475a] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search servers..."
                className="flex-1 bg-transparent text-xs text-[#cdd6f4] placeholder-[#45475a] outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[#45475a] hover:text-[#cdd6f4] transition-colors">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
            <HostTree searchQuery={searchQuery} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.04] px-2 py-2 flex gap-1">
          <button
            onClick={toggleSnippets}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-medium text-[#45475a] hover:text-[#cdd6f4] hover:bg-white/[0.04] transition-all active:scale-[0.98]"
          >
            <Code2 size={12} /> Snippets
          </button>
          <button
            onClick={toggleSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-medium text-[#45475a] hover:text-[#cdd6f4] hover:bg-white/[0.04] transition-all active:scale-[0.98]"
          >
            <Settings size={12} /> Settings
          </button>
        </div>
      </div>

      {showHostForm && <HostForm onClose={() => setShowHostForm(false)} />}
      {showGroupForm && <GroupForm onClose={() => setShowGroupForm(false)} />}
    </>
  )
}
