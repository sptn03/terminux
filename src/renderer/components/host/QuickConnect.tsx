import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminal-store'

export default function QuickConnect() {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const addTab = useTerminalStore((s) => s.addTab)
  const updateTabState = useTerminalStore((s) => s.updateTabState)

  const handleConnect = async () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return

    // Parse user@host:port
    let username = 'root'
    let host = trimmed
    let port = 22

    const atIdx = trimmed.indexOf('@')
    if (atIdx > 0) {
      username = trimmed.slice(0, atIdx)
      host = trimmed.slice(atIdx + 1)
    }

    const colonIdx = host.lastIndexOf(':')
    if (colonIdx > 0) {
      port = parseInt(host.slice(colonIdx + 1)) || 22
      host = host.slice(0, colonIdx)
    }

    const sessionId = `qc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const label = `${username}@${host}:${port}`

    const config = {
      host,
      port,
      username,
      authMethod: 'password' as const,
      password: '',
      sessionId
    }

    addTab({ sessionId, hostId: sessionId, label, connected: false, loading: false, config })
    setValue('')
  }

  return (
    <div className="px-3 py-2 border-b border-[#313244]">
      <div className="flex items-center gap-1 bg-[#1e1e2e] rounded-md px-2 py-1.5 border border-[#313244] focus-within:border-[#89b4fa] transition-colors">
        <input
          type="text"
          data-qc
          placeholder="user@host:port"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          className="flex-1 bg-transparent text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none"
        />
        {loading ? (
          <Loader2 size={14} className="text-[#89b4fa] animate-spin" />
        ) : (
          <button
            onClick={handleConnect}
            className="p-0.5 rounded text-[#6c7086] hover:text-[#89b4fa] transition-colors"
          >
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
