import { useState, useEffect } from 'react'
import { X, FileKey } from 'lucide-react'
import { useHostStore } from '../../stores/host-store'
import type { Host } from '../../types'

interface HostFormProps {
  host?: Host | null
  onClose: () => void
}

export default function HostForm({ host, onClose }: HostFormProps) {
  const groups = useHostStore((s) => s.groups)
  const saveHost = useHostStore((s) => s.saveHost)

  const [name, setName] = useState(host?.name ?? '')
  const [hostname, setHostname] = useState(host?.host ?? '')
  const [port, setPort] = useState(String(host?.port ?? 22))
  const [username, setUsername] = useState(host?.username ?? 'root')
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>(host?.authMethod === 'key' ? 'key' : 'password')
  const [password, setPassword] = useState(host?.password ?? '')
  const [privateKeyPath, setPrivateKeyPath] = useState(host?.privateKeyPath ?? '')
  const [passphrase, setPassphrase] = useState(host?.passphrase ?? '')
  const [groupId, setGroupId] = useState(host?.groupId ?? '')
  const [color, setColor] = useState(host?.color ?? '#89b4fa')
  const [notes, setNotes] = useState(host?.notes ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !hostname) return

    await saveHost({
      id: host?.id,
      name,
      host: hostname,
      port: parseInt(port) || 22,
      username,
      authMethod,
      password: authMethod === 'password' ? password : null,
      privateKeyPath: authMethod === 'key' ? privateKeyPath : null,
      passphrase: authMethod === 'key' ? passphrase : null,
      groupId: groupId || null,
      color: color || null,
      notes: notes || null,
      sortOrder: host?.sortOrder ?? 0
    })

    onClose()
  }

  const handleSelectKey = async () => {
    const path = await window.api.app.selectFile([
      { name: 'Private Key', extensions: ['*'] }
    ])
    if (path) setPrivateKeyPath(path)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dialog-overlay">
      <div className="bg-[#1e1e2e] border border-[#313244] rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto modal-enter">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#313244] bg-gradient-to-r from-[#181825] to-transparent">
          <h2 className="text-sm font-semibold text-[#cdd6f4] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#89b4fa]" />
            {host ? 'Edit Server' : 'Add Server'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#313244] text-[#585b70] hover:text-[#cdd6f4] transition-all">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Label</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
                placeholder="My Server"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Hostname / IP</label>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
                placeholder="192.168.1.100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Port</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
                type="number"
                min={1}
                max={65535}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#a6adc8] mb-1">Group</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Auth method */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-2">Authentication</label>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAuthMethod('password')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  authMethod === 'password'
                    ? 'bg-[#89b4fa] text-[#1e1e2e] font-medium'
                    : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('key')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  authMethod === 'key'
                    ? 'bg-[#89b4fa] text-[#1e1e2e] font-medium'
                    : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
                }`}
              >
                SSH Key
              </button>
            </div>

            {authMethod === 'password' ? (
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
                placeholder="Password"
              />
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={privateKeyPath}
                    onChange={(e) => setPrivateKeyPath(e.target.value)}
                    className="flex-1 bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
                    placeholder="~/.ssh/id_rsa"
                  />
                  <button
                    type="button"
                    onClick={handleSelectKey}
                    className="px-2 py-1 rounded bg-[#313244] text-[#a6adc8] hover:bg-[#45475a] transition-colors"
                  >
                    <FileKey size={14} />
                  </button>
                </div>
                <input
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  type="password"
                  className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
                  placeholder="Passphrase (optional)"
                />
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1">Tag Color</label>
            <div className="flex gap-2">
              {['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7', '#94e2d5', '#fab387', '#6c7086'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-colors ${
                    color === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa] resize-none"
              rows={2}
              placeholder="Any notes about this server..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#313244]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded text-xs font-medium bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors"
            >
              {host ? 'Save Changes' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
