import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Server, Monitor, Edit2, Trash2, Play } from 'lucide-react'
import { useHostStore } from '../../stores/host-store'
import { useTerminalStore } from '../../stores/terminal-store'
import HostForm from './HostForm'
import type { Host, Group } from '../../types'

function buildTree(groups: Group[], hosts: Host[]): Group[] {
  const map = new Map<string, Group>()
  const roots: Group[] = []
  for (const g of groups) map.set(g.id, { ...g, children: [], hosts: [] })
  for (const g of map.values()) {
    if (g.parentId && map.has(g.parentId)) map.get(g.parentId)!.children!.push(g)
    else if (!g.parentId) roots.push(g)
  }
  for (const host of hosts) {
    if (host.groupId && map.has(host.groupId)) map.get(host.groupId)!.hosts!.push(host)
  }
  const sort = (arr: any[]) => arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  sort(roots);
  for (const g of map.values()) { sort(g.children!); sort(g.hosts!) }
  return roots
}

function GroupNode({ group, depth }: { group: Group; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = (group.children?.length ?? 0) > 0 || (group.hosts?.length ?? 0) > 0

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer hover:bg-white/[0.03] text-[#cdd6f4] transition-all"
        style={{ paddingLeft: `${room(depth)}px` }} onClick={() => setExpanded(!expanded)}>
        {hasChildren ? (
          expanded ? <ChevronDown size={11} className="text-[#585b70] shrink-0" /> : <ChevronRight size={11} className="text-[#585b70] shrink-0" />
        ) : <span className="w-[11px] shrink-0" />}
        {expanded ? <FolderOpen size={13} className="text-[#f9e2af] shrink-0" /> : <Folder size={13} className="text-[#f9e2af] shrink-0" />}
        <span className="text-xs truncate font-medium">{group.name}</span>
      </div>
      {expanded && <>
        {group.hosts?.map((host) => <HostItem key={host.id} host={host} depth={depth + 1} />)}
        {group.children?.map((child) => <GroupNode key={child.id} group={child} depth={depth + 1} />)}
      </>}
    </div>
  )
}

function room(depth: number) { return 8 + depth * 14 }

function HostItem({ host, depth }: { host: Host; depth: number }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editing, setEditing] = useState(false)
  const deleteHost = useHostStore((s) => s.deleteHost)
  const addTab = useTerminalStore((s) => s.addTab)

  const handleConnect = async () => {
    const sessionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const updateTabState = useTerminalStore.getState().updateTabState

    const config = {
      host: host.host,
      port: host.port,
      username: host.username,
      authMethod: host.authMethod,
      password: host.password ?? undefined,
      privateKeyPath: host.privateKeyPath ?? undefined,
      passphrase: host.passphrase ?? undefined,
      sessionId
    }

    const needsPasswordPrompt = host.authMethod === 'password' && !host.password

    addTab({
      sessionId,
      hostId: host.id,
      label: host.name,
      connected: false,
      loading: !needsPasswordPrompt,
      config
    })

    if (!needsPasswordPrompt) {
      const result = await window.api.ssh.connect(config)
      updateTabState(sessionId, {
        connected: !result.error,
        loading: false,
        label: result.error ? `${host.name} (error)` : host.name
      })
    }
  }

  const handleContextMenu = (ev: React.MouseEvent) => {
    ev.preventDefault()
    setMenuPos({ x: ev.clientX, y: ev.clientY })
    setShowMenu(true)
  }

  return (
    <>
      <div className="group flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-white/[0.03] transition-all relative"
        style={{ paddingLeft: `${room(depth)}px` }}
        onContextMenu={handleContextMenu}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: host.color || '#585b70' }} />
        <Monitor size={12} className="text-[#89b4fa] shrink-0" />
        <span className="text-xs truncate flex-1">{host.name}</span>
        <span className="text-[10px] text-[#45475a] hidden group-hover:block font-mono">{host.host}:{host.port}</span>
        <button onClick={handleConnect}
          className="p-0.5 rounded text-[#45475a] hover:text-[#a6e3a1] hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
          title="Connect"><Play size={12} /></button>
      </div>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)} />
          <div className="fixed z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px] slide-up"
            style={{ left: menuPos.x, top: menuPos.y }} onClick={() => setShowMenu(false)}>
            <button onClick={() => { setEditing(true); setShowMenu(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#cdd6f4] hover:bg-white/5">
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => { deleteHost(host.id); setShowMenu(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#f38ba8] hover:bg-white/5">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}
      {editing && <HostForm host={host} onClose={() => setEditing(false)} />}
    </>
  )
}

export default function HostTree({ searchQuery = '' }: { searchQuery?: string }) {
  const hosts = useHostStore((s) => s.hosts)
  const groups = useHostStore((s) => s.groups)
  const q = searchQuery.toLowerCase().trim()
  const filteredHosts = q ? hosts.filter((h) => h.name.toLowerCase().includes(q) || h.host.toLowerCase().includes(q) || h.username.toLowerCase().includes(q)) : hosts
  const filteredGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups
  const tree = buildTree(filteredGroups, filteredHosts)
  const ungroupedHosts = filteredHosts.filter((h) => !h.groupId)

  if (hosts.length === 0 && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-[#585b70]">
        <Server size={22} className="mb-2 opacity-40" />
        <div className="text-xs font-medium">No servers yet</div>
        <div className="text-[10px] mt-1 text-[#45475a]">Click + to add</div>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {tree.map((group) => <GroupNode key={group.id} group={group} depth={0} />)}
      {ungroupedHosts.map((host) => <HostItem key={host.id} host={host} depth={0} />)}
    </div>
  )
}
