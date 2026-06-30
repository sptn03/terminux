import { useState, useEffect } from 'react'
import { X, Plus, Plug, PlugZap, Trash2, ArrowRight, Wifi, Pencil, Database, Globe, Shuffle, Network } from 'lucide-react'

interface Tunnel {
  id: string; sessionId: string; type: 'local' | 'remote'; name: string
  listenHost: string; listenPort: number; targetHost: string; targetPort: number
  active: boolean; error?: string
}

interface TunnelPanelProps {
  sessionId: string | null
  visible: boolean
  onToggle: () => void
  embedded?: boolean
}

export default function TunnelPanel({ sessionId, visible, onToggle, embedded = false }: TunnelPanelProps) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form fields
  const [type, setType] = useState<'local' | 'remote'>('local')
  const [name, setName] = useState('')
  const [localPort, setLocalPort] = useState('')
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [remotePorts, setRemotePorts] = useState<number[]>([])

  const loadTunnels = async () => {
    try {
      const list = await window.api.tunnel.list()
      setTunnels(list)
    } catch {}
  }

  useEffect(() => {
    if (visible) {
      loadTunnels()
      scanRemotePorts()
    }
    const interval = setInterval(loadTunnels, 3000)
    return () => clearInterval(interval)
  }, [visible, sessionId])

  const resetForm = () => {
    setName('')
    setLocalPort('')
    setRemoteHost('127.0.0.1')
    setRemotePort('')
    setError('')
    setEditingId(null)
    setType('local')
  }

  const scanRemotePorts = async () => {
    if (!sessionId) return
    setScanning(true)
    try {
      const result = await window.api.port.scan(sessionId)
      if (Array.isArray(result)) setRemotePorts(result)
    } catch {}
    setScanning(false)
  }

  const handleStartTunnel = async () => {
    if (!sessionId || !name || !localPort || !remotePort) return
    setError('')
    try {
      if (editingId) {
        await window.api.tunnel.stop(editingId)
      }

      let result
      if (type === 'local') {
        result = await window.api.tunnel.startLocal(sessionId, name, parseInt(localPort), remoteHost, parseInt(remotePort))
      } else {
        // startRemote(sessionId, name, remotePort, localHost, localPort)
        result = await window.api.tunnel.startRemote(sessionId, name, parseInt(remotePort), remoteHost, parseInt(localPort))
      }

      if (result.error) {
        setError(result.error)
      } else {
        setShowForm(false)
        resetForm()
      }
      loadTunnels()
    } catch (err: any) {
      setError(err.message || 'Lỗi thiết lập tunnel')
    }
  }

  const handleStop = async (id: string) => {
    try {
      await window.api.tunnel.stop(id)
      loadTunnels()
    } catch {}
  }

  const startEdit = (t: Tunnel) => {
    setName(t.name)
    setType(t.type)
    setLocalPort(String(t.listenPort))
    setRemoteHost(t.targetHost)
    setRemotePort(String(t.targetPort))
    setEditingId(t.id)
    setShowForm(true)
  }

  // Preset configuration autofill
  const applyPreset = (service: 'mysql' | 'postgres' | 'redis' | 'mongo') => {
    const presets = {
      mysql: { name: 'MySQL Tunnel', port: '3306' },
      postgres: { name: 'Postgres Tunnel', port: '5432' },
      redis: { name: 'Redis Tunnel', port: '6379' },
      mongo: { name: 'MongoDB Tunnel', port: '27017' }
    }
    const p = presets[service]
    setName(p.name)
    setLocalPort(p.port)
    setRemoteHost('127.0.0.1')
    setRemotePort(p.port)
  }

  if (!visible) return null

  const tunnelsCount = tunnels.length

  return (
    <div className={`${embedded ? 'flex-1' : 'w-[390px] min-w-[390px]'} bg-[#181825]/96 backdrop-blur-md border-r border-white/5 flex flex-col shrink-0`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#11111b]/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#fab387]/10 flex items-center justify-center">
            <Plug size={11} className="text-[#fab387]" />
          </div>
          <span className="text-xs font-bold text-[#cdd6f4] tracking-wider">SSH Tunnel Manager</span>
          {tunnelsCount > 0 && (
            <span className="text-[9px] font-bold text-[#a6e3a1] bg-[#a6e3a1]/10 px-1.5 py-0.5 rounded-full animate-pulse">{tunnelsCount} active</span>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { resetForm(); setShowForm(!showForm) }}
            className={`p-1 rounded-lg hover:bg-white/5 transition-all active:scale-95 ${showForm ? 'text-[#fab387] bg-white/5' : 'text-[#585b70] hover:text-[#cdd6f4]'}`}
            title="Thêm Tunnel mới"
          >
            <Plus size={14} />
          </button>
          {!embedded && (
            <button onClick={onToggle} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4] transition-all"><X size={14} /></button>
          )}
        </div>
      </div>

      {/* Forms and presets container */}
      {showForm && (
        <div className="border-b border-white/5 bg-[#11111b]/10 shrink-0 p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-[#585b70] uppercase tracking-wider">{editingId ? 'Chỉnh sửa Tunnel' : 'Tạo Tunnel mới'}</span>
            
            {/* Forwarding Type Selector */}
            <div className="flex bg-[#11111b] p-0.5 rounded-lg border border-white/5">
              <button
                type="button"
                onClick={() => setType('local')}
                className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all ${type === 'local' ? 'bg-[#fab387] text-[#11111b]' : 'text-[#a6adc8]'}`}
              >
                Local (L➔R)
              </button>
              <button
                type="button"
                onClick={() => setType('remote')}
                className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all ${type === 'remote' ? 'bg-[#fab387] text-[#11111b]' : 'text-[#a6adc8]'}`}
              >
                Remote (R➔L)
              </button>
            </div>
          </div>

          {/* Preset Buttons Grid */}
          <div className="space-y-1.5">
            <span className="text-[9px] text-[#585b70] uppercase font-bold">Mẫu dịch vụ (Presets)</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['mysql', 'postgres', 'redis', 'mongo'] as const).map(svc => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => applyPreset(svc)}
                  className="px-2 py-1 rounded bg-[#313244]/30 hover:bg-[#313244]/60 border border-white/5 text-[9px] font-bold text-[#cdd6f4] capitalize transition-all active:scale-95 flex items-center justify-center gap-1"
                >
                  <Database size={9} className="text-[#89b4fa]" />
                  {svc}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-2 text-xs">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tên gợi nhớ (ví dụ: Mysql Server)"
              className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#45475a] outline-none focus:border-[#fab387]/30 transition-all font-semibold"
            />
            
            <div className="grid grid-cols-12 gap-2 items-center">
              {/* Local End */}
              <div className="col-span-4 flex flex-col gap-1">
                <label className="text-[9px] font-bold text-[#585b70] uppercase">{type === 'local' ? 'PC Listen Port' : 'PC Target Port'}</label>
                <input
                  value={localPort}
                  onChange={e => setLocalPort(e.target.value)}
                  placeholder="3306"
                  type="number"
                  className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#fab387]/30 font-mono"
                />
              </div>

              {/* Data Direction Arrow */}
              <div className="col-span-1 flex justify-center pt-3 text-[#585b70]">
                <ArrowRight size={14} className={type === 'remote' ? 'rotate-180 text-[#fab387]' : 'text-[#89b4fa]'} />
              </div>

              {/* Remote End Host */}
              <div className="col-span-4 flex flex-col gap-1">
                <label className="text-[9px] font-bold text-[#585b70] uppercase">Target Host</label>
                <input
                  value={remoteHost}
                  onChange={e => setRemoteHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#fab387]/30 font-mono"
                />
              </div>

              {/* Remote End Port */}
              <div className="col-span-3 flex flex-col gap-1">
                <label className="text-[9px] font-bold text-[#585b70] uppercase">{type === 'local' ? 'Server Port' : 'Server Listen'}</label>
                <input
                  value={remotePort}
                  onChange={e => setRemotePort(e.target.value)}
                  placeholder="3306"
                  type="number"
                  className="w-full bg-[#11111b] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#fab387]/30 font-mono"
                />
              </div>
            </div>
          </div>

          {error && <div className="text-[10px] text-[#f38ba8] bg-[#f38ba8]/5 rounded-lg p-2 border border-[#f38ba8]/10">{error}</div>}

          {/* Form Action buttons */}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); resetForm() }} className="px-3.5 py-1.5 rounded-lg text-[10px] text-[#585b70] hover:bg-white/5 font-semibold transition-all">Hủy</button>
            <button
              onClick={handleStartTunnel}
              disabled={!sessionId || !name || !localPort || !remotePort}
              className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-[#fab387]/10 text-[#fab387] hover:bg-[#fab387]/20 disabled:opacity-30 transition-all active:scale-95"
            >
              {editingId ? 'Cập nhật' : 'Kích hoạt Tunnel'}
            </button>
          </div>

          {/* Active Listening Ports from Server */}
          <div className="space-y-1.5 pt-2 border-t border-white/[0.03]">
            <div className="flex justify-between items-center text-[9px] text-[#585b70] font-bold uppercase">
              <span>Cổng khả dụng trên Server</span>
              {scanning ? (
                <span className="text-[#89b4fa] animate-pulse">đang quét...</span>
              ) : (
                <button onClick={scanRemotePorts} className="text-[#89b4fa] hover:underline font-bold">Quét lại</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto scrollbar-thin">
              {remotePorts.length === 0 ? (
                <span className="text-[9px] text-[#45475a] italic">Không phát hiện cổng nào đang lắng nghe</span>
              ) : (
                remotePorts.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setName(`Port ${p} Tunnel`)
                      setRemotePort(String(p))
                      setLocalPort(String(p))
                    }}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#a6e3a1]/10 text-[#a6e3a1] border border-[#a6e3a1]/15 hover:bg-[#a6e3a1]/25 transition-all"
                  >
                    :{p}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tunnel list scroll */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {!showForm && tunnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-[#585b70]">
            <Network size={36} className="mb-3 opacity-30 animate-pulse text-[#fab387]" />
            <span className="text-xs font-semibold">Chưa thiết lập SSH Tunnel nào</span>
            <span className="text-[9px] mt-1 text-[#45475a] max-w-[200px] leading-relaxed">
              Bấm nút <Plus size={9} className="inline-block" /> ở trên để cấu hình chuyển tiếp cổng bảo mật.
            </span>
          </div>
        ) : (
          tunnels.map((t) => (
            <div
              key={t.id}
              className={`bg-white/[0.01] border border-white/5 rounded-xl p-3.5 transition-all relative group flex flex-col gap-2.5 ${
                t.active ? 'hover:bg-white/[0.02]' : 'opacity-40'
              }`}
            >
              {/* Card Title & Type */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.active ? 'bg-[#a6e3a1] shadow-[0_0_6px_rgba(166,227,161,0.4)]' : 'bg-[#585b70]'}`} />
                  <span className="text-xs font-bold text-[#cdd6f4]">{t.name}</span>
                </div>
                
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  t.type === 'local' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'bg-[#fab387]/10 text-[#fab387]'
                }`}>
                  {t.type === 'local' ? 'Local Forward' : 'Remote Forward'}
                </span>
              </div>

              {/* Visual connection flowchart */}
              <div className="bg-[#11111b]/50 border border-white/[0.02] rounded-lg p-2.5 flex items-center justify-between text-[10px] font-mono">
                {t.type === 'local' ? (
                  <>
                    <div className="flex flex-col items-center">
                      <span className="text-[#a6adc8] font-bold">:{t.listenPort}</span>
                      <span className="text-[8px] text-[#585b70]">Local PC</span>
                    </div>
                    
                    <div className="flex-1 flex flex-col items-center justify-center px-1">
                      <span className="text-[7px] text-[#a6e3a1] uppercase font-bold tracking-widest animate-pulse">SSH Tunnel</span>
                      <div className="w-full flex items-center gap-0.5 justify-center text-[#585b70]">
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#a6e3a1]" />
                        <ArrowRight size={10} className="text-[#a6e3a1] -mr-1" />
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-[#a6e3a1] to-transparent" />
                      </div>
                    </div>

                    <div className="flex flex-col items-center text-right max-w-[120px]">
                      <span className="text-[#a6adc8] font-bold truncate block w-full text-right" title={`${t.targetHost}:${t.targetPort}`}>
                        {t.targetHost}:{t.targetPort}
                      </span>
                      <span className="text-[8px] text-[#585b70]">Remote Target</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center max-w-[120px]">
                      <span className="text-[#a6adc8] font-bold truncate block w-full text-left" title={`${t.targetHost}:${t.targetPort}`}>
                        {t.targetHost}:{t.targetPort}
                      </span>
                      <span className="text-[8px] text-[#585b70]">Local Target</span>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center px-1">
                      <span className="text-[7px] text-[#fab387] uppercase font-bold tracking-widest animate-pulse">Reverse SSH</span>
                      <div className="w-full flex items-center gap-0.5 justify-center text-[#585b70]">
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#fab387]" />
                        <ArrowRight size={10} className="text-[#fab387] rotate-180 -ml-1" />
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-[#fab387] to-transparent" />
                      </div>
                    </div>

                    <div className="flex flex-col items-center text-right">
                      <span className="text-[#a6adc8] font-bold">:{t.listenPort}</span>
                      <span className="text-[8px] text-[#585b70]">Remote Listen</span>
                    </div>
                  </>
                )}
              </div>

              {t.error && <div className="text-[9px] text-[#f38ba8] bg-[#f38ba8]/5 rounded px-2 py-1 border border-[#f38ba8]/10">{t.error}</div>}

              {/* Action Buttons */}
              <div className="absolute right-3.5 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(t)}
                  className="p-1 rounded-md bg-[#313244]/40 hover:bg-[#313244] text-[#a6adc8] hover:text-[#89b4fa] transition-all"
                  title="Chỉnh sửa"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => handleStop(t.id)}
                  className="p-1 rounded-md bg-[#313244]/40 hover:bg-[#313244] text-[#a6adc8] hover:text-[#f38ba8] transition-all"
                  title="Đóng Tunnel"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
