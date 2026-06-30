import { useState, useEffect } from 'react'
import { X, Monitor, Type, MousePointer2, Layers, Clock, Trash2 } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import type { ThemeConfig } from '../../types'

const stripAnsi = (str: string) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

function ThemePreview({ config }: { config: string }) {
  let colors: ThemeConfig
  try { colors = JSON.parse(config) } catch { return null }
  const swatches = [
    colors.black, colors.red, colors.green, colors.yellow,
    colors.blue, colors.magenta, colors.cyan, colors.white
  ]
  return (
    <div className="flex gap-0.5">
      {swatches.map((c, i) => (
        <div key={i} className="w-3.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

export default function SettingsModal() {
  const showSettings = useSettingsStore((s) => s.showSettings)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const themes = useSettingsStore((s) => s.themes)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const fontFamily = useSettingsStore((s) => s.fontFamily)
  const setFontFamily = useSettingsStore((s) => s.setFontFamily)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const cursorStyle = useSettingsStore((s) => s.cursorStyle)
  const setCursorStyle = useSettingsStore((s) => s.setCursorStyle)
  const cursorBlink = useSettingsStore((s) => s.cursorBlink)
  const setCursorBlink = useSettingsStore((s) => s.setCursorBlink)
  const opacity = useSettingsStore((s) => s.opacity)
  const setOpacity = useSettingsStore((s) => s.setOpacity)
  const backgroundImage = useSettingsStore((s) => s.backgroundImage)
  const setBackgroundImage = useSettingsStore((s) => s.setBackgroundImage)
  const backgroundBlur = useSettingsStore((s) => s.backgroundBlur)
  const setBackgroundBlur = useSettingsStore((s) => s.setBackgroundBlur)
  const [fontInput, setFontInput] = useState(fontFamily)

  // Settings Tabs state
  const [activeTab, setActiveTab] = useState<'appearance' | 'history'>('appearance')
  const [historyList, setHistoryList] = useState<any[]>([])
  const [viewLogContent, setViewLogContent] = useState<string | null>(null)
  const [selectedSessionName, setSelectedSessionName] = useState<string>('')

  const loadHistory = async () => {
    try {
      const list = await window.api.history.list()
      setHistoryList(list)
    } catch {}
  }

  useEffect(() => {
    if (showSettings && activeTab === 'history') {
      loadHistory()
    }
  }, [showSettings, activeTab])

  if (!showSettings) return null

  const sectionClass = "space-y-3"
  const labelClass = "block text-xs font-medium text-[#a6adc8]"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dialog-overlay">
      <div className="bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col overflow-hidden modal-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-[#1e1e2e] shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
            Settings
          </h2>
          <button onClick={toggleSettings} className="p-1.5 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-5 border-b border-white/5 bg-[#181825]/40 shrink-0">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'appearance'
                ? 'border-[#89b4fa] text-[#89b4fa]'
                : 'border-transparent text-[#585b70] hover:text-[#cdd6f4]'
            }`}
          >
            Appearance
          </button>
          <button
            onClick={() => { setActiveTab('history'); loadHistory() }}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-[#89b4fa] text-[#89b4fa]'
                : 'border-transparent text-[#585b70] hover:text-[#cdd6f4]'
            }`}
          >
            Session History
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="space-y-7">
              {/* Theme */}
              <section className={sectionClass}>
                <div className="flex items-center gap-2">
                  <Monitor size={14} className="text-[#89b4fa]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Terminal Theme</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((t) => (
                    <button key={t.id} onClick={() => setTheme(t.id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                        theme === t.id
                          ? 'border-[#89b4fa] bg-[#89b4fa]/5'
                          : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                      }`}>
                      <div className="text-xs font-medium">{t.name}</div>
                      <ThemePreview config={t.config} />
                    </button>
                  ))}
                </div>
              </section>

              {/* Font */}
              <section className={sectionClass}>
                <div className="flex items-center gap-2">
                  <Type size={14} className="text-[#89b4fa]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Font</h3>
                </div>
                <div>
                  <label className={labelClass}>Family</label>
                  <input value={fontInput} onChange={(e) => setFontInput(e.target.value)}
                    onBlur={() => setFontFamily(fontInput)} onKeyDown={(e) => e.key === 'Enter' && setFontFamily(fontInput)}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa] font-mono mt-1" />
                  <div className="text-[10px] text-[#585b70] mt-1">Examples: JetBrains Mono, Menlo, Fira Code</div>
                </div>
                <div>
                  <label className={labelClass}>Size: <span className="text-[#cdd6f4] font-mono">{fontSize}px</span></label>
                  <input type="range" min={10} max={24} step={1} value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full mt-1" />
                </div>
              </section>

              {/* Cursor */}
              <section className={sectionClass}>
                <div className="flex items-center gap-2">
                  <MousePointer2 size={14} className="text-[#89b4fa]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Cursor</h3>
                </div>
                <div className="flex gap-2">
                  {(['block', 'underline', 'bar'] as const).map((s) => (
                    <button key={s} onClick={() => setCursorStyle(s)}
                      className={`px-4 py-1.5 rounded-lg text-xs capitalize transition-all ${
                        cursorStyle === s ? 'bg-[#89b4fa] text-[#1e1e2e] font-medium' : 'bg-white/5 text-[#a6adc8] hover:bg-white/10'
                      }`}>{s}</button>
                  ))}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cursorBlink} onChange={(e) => setCursorBlink(e.target.checked)} />
                  <span className="text-xs text-[#a6adc8]">Blinking cursor</span>
                </label>
              </section>

              {/* Background — opacity + image */}
              <section className={sectionClass}>
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-[#89b4fa]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Background</h3>
                </div>
                <div>
                  <label className={labelClass}>Opacity: <span className="text-[#cdd6f4] font-mono">{Math.round(opacity * 100)}%</span></label>
                  <input type="range" min={50} max={100} step={5} value={Math.round(opacity * 100)}
                    onChange={(e) => setOpacity(parseInt(e.target.value) / 100)} className="w-full mt-1" />
                </div>
                <div>
                  <label className={labelClass}>Image</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input value={backgroundImage} onChange={(e) => setBackgroundImage(e.target.value)}
                      placeholder="Image path or URL..."
                      className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa] font-mono" />
                    <button onClick={async () => {
                      const path = await window.api.app.selectFile([{ name: 'Images', extensions: ['jpg','jpeg','png','gif','webp','bmp'] }])
                      if (path) setBackgroundImage(path)
                    }} className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#a6adc8] text-xs transition-all shrink-0">
                      Browse
                    </button>
                    {backgroundImage && (
                      <button onClick={() => setBackgroundImage('')} className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#585b70] text-xs transition-all shrink-0">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <label className={labelClass}>Blur: <span className="text-[#cdd6f4] font-mono">{backgroundBlur}px</span></label>
                    <input type="range" min={0} max={40} step={1} value={backgroundBlur}
                      onChange={(e) => setBackgroundBlur(parseInt(e.target.value))} className="w-full mt-1" />
                  </div>
                  {backgroundImage && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-white/5 h-20 bg-[#181825]">
                      <img src={backgroundImage} alt="preview"
                        className="w-full h-full object-cover"
                        style={{ filter: `blur(${backgroundBlur}px)` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* SESSION HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[#89b4fa]" />
                  <span className="text-[10px] text-[#585b70] uppercase font-semibold">Lịch sử kết nối SSH</span>
                </div>
                {historyList.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử và nhật ký phiên làm việc?')) {
                        await window.api.history.clear()
                        loadHistory()
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/20 text-[10px] font-bold transition-all active:scale-95"
                  >
                    <Trash2 size={11} />
                    Xóa tất cả
                  </button>
                )}
              </div>

              <div className="space-y-2 overflow-y-auto flex-1 pr-1 scrollbar-thin">
                {historyList.length === 0 ? (
                  <div className="text-center text-[#585b70] text-xs py-12">Không có lịch sử kết nối nào.</div>
                ) : (
                  historyList.map((hist) => (
                    <div key={hist.id} className="bg-white/[0.01] border border-white/5 rounded-xl p-3 flex justify-between items-center hover:bg-white/[0.02] transition-all">
                      <div>
                        <div className="text-xs font-bold text-[#cdd6f4]">{hist.host_name}</div>
                        <div className="text-[9px] text-[#585b70] font-mono mt-0.5">{hist.host_address}</div>
                        <div className="text-[9px] text-[#a6adc8] mt-1.5 flex flex-col gap-0.5">
                          <span>Bắt đầu: {new Date(hist.started_at).toLocaleString()}</span>
                          {hist.ended_at && <span>Kết thúc: {new Date(hist.ended_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setSelectedSessionName(hist.host_name)
                          const log = await window.api.history.readLog(hist.id)
                          setViewLogContent(stripAnsi(log))
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold transition-all hover:text-[#89b4fa] active:scale-95"
                      >
                        Xem Nhật Ký
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Viewer Overlay Modal */}
      {viewLogContent !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm" onClick={() => setViewLogContent(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[700px] h-[80vh] flex flex-col modal-enter" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#181825] shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f38ba8]" />
                Nhật ký phiên: {selectedSessionName}
              </span>
              <button onClick={() => setViewLogContent(null)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all">
                <X size={14} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 font-mono text-[10px] bg-[#11111b] text-[#bac2de] leading-relaxed whitespace-pre-wrap select-text selection:bg-white/10 scrollbar-thin">
              {viewLogContent || 'Phiên làm việc này không ghi nhận dữ liệu nào.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
