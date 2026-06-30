import { useState } from 'react'
import { X } from 'lucide-react'
import { useHostStore } from '../../stores/host-store'

interface GroupFormProps {
  group?: { id: string; name: string; parentId: string | null } | null
  onClose: () => void
}

export default function GroupForm({ group, onClose }: GroupFormProps) {
  const groups = useHostStore((s) => s.groups)
  const saveGroup = useHostStore((s) => s.saveGroup)
  const [name, setName] = useState(group?.name ?? '')
  const [parentId, setParentId] = useState(group?.parentId ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await saveGroup({
      id: group?.id,
      name: name.trim(),
      parentId: parentId || null,
      sortOrder: 0
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-2xl w-[360px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
          <h2 className="text-sm font-semibold text-[#cdd6f4]">
            {group ? 'Edit Group' : 'New Group'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#313244] text-[#6c7086]">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1">Group Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
              placeholder="Production"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#a6adc8] mb-1">Parent Group</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
            >
              <option value="">No parent (top level)</option>
              {groups.filter((g) => g.id !== group?.id).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs text-[#a6adc8] hover:bg-[#313244] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded text-xs font-medium bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors"
            >
              {group ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
