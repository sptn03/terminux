import { useEffect, useState } from 'react'
import { Terminal, Minus, Square, X, PanelLeft, PanelLeftClose } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized)
    const unsub = window.api.window.onMaximizedChange(setMaximized)
    return unsub
  }, [])

  return (
    <div
      className="flex items-center h-[34px] bg-[#11111b] select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Sidebar toggle button + Logo — left side */}
      <div className="flex items-center gap-2 pl-[14px] pr-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md text-[#585b70] hover:text-[#cdd6f4] hover:bg-white/[0.04] transition-all flex items-center justify-center active:scale-95 animate-fade-in"
          title={sidebarCollapsed ? 'Hiện thanh bên' : 'Ẩn thanh bên'}
        >
          {sidebarCollapsed ? <PanelLeft size={13} /> : <PanelLeftClose size={13} />}
        </button>
        <div className="w-[18px] h-[18px] rounded-[8px] bg-gradient-to-br from-[#89b4fa] to-[#cba6f7] p-[1px] shrink-0">
          <div className="w-full h-full rounded-[7px] bg-[#11111b] flex items-center justify-center">
            <Terminal size={10} className="text-[#89b4fa]" />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="flex-1 text-center text-[11px] text-[#585b70] font-medium tracking-wide">
        Terminux
      </div>

      {/* Traffic lights + logo — right side */}
      <div className="flex items-center gap-[7px] pr-[14px] pl-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.api.window.minimize()}
          className="w-[12px] h-[12px] rounded-full bg-[#f9e2af] opacity-40 hover:opacity-100 transition-all duration-150 hover:scale-110 group"
          title="Minimize"
        >
          <Minus size={7} className="text-[#11111b] opacity-0 group-hover:opacity-100 mx-auto mt-[2.5px]" strokeWidth={3} />
        </button>
        <button
          onClick={() => window.api.window.maximize()}
          className="w-[12px] h-[12px] rounded-full bg-[#a6e3a1] opacity-40 hover:opacity-100 transition-all duration-150 hover:scale-110 group"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          <Square size={6} className="text-[#11111b] opacity-0 group-hover:opacity-100 mx-auto mt-[2px]" strokeWidth={3} />
        </button>
        <button
          onClick={() => window.api.window.close()}
          className="w-[12px] h-[12px] rounded-full bg-[#f38ba8] opacity-40 hover:opacity-100 transition-all duration-150 hover:scale-110 group"
          title="Close"
        >
          <X size={7} className="text-[#11111b] opacity-0 group-hover:opacity-100 mx-auto mt-[2.5px]" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
