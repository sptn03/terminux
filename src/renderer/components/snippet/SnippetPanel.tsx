import { useState, useMemo } from 'react'
import {
  X,
  Copy,
  Terminal,
  Plus,
  Search,
  Trash2
} from 'lucide-react'
import { useSnippetStore } from '../../stores/snippet-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useTerminalStore } from '../../stores/terminal-store'
import type { Snippet } from '../../types'

interface SnippetCardProps {
  snippet: Snippet
  onPrompt: (snippet: Snippet, variables: string[], actionType: 'send' | 'copy') => void
}

function SnippetCard({ snippet, onPrompt }: SnippetCardProps) {
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const regex = /\{\{([^}]+)\}\}/g
    const matches = Array.from(new Set(Array.from(snippet.command.matchAll(regex)).map(m => m[1])))
    if (matches.length > 0) {
      onPrompt(snippet, matches, 'copy')
      return
    }

    await window.api.app.copyToClipboard(snippet.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSend = () => {
    const regex = /\{\{([^}]+)\}\}/g
    const matches = Array.from(new Set(Array.from(snippet.command.matchAll(regex)).map(m => m[1])))
    if (matches.length > 0) {
      onPrompt(snippet, matches, 'send')
      return
    }

    if (!activeTabId) {
      window.api.app.copyToClipboard(snippet.command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return
    }
    window.api.ssh.shellInput(activeTabId, snippet.command + '\n')
  }

  return (
    <div className="group bg-[#181825] border border-[#313244] rounded-lg p-3 hover:border-[#45475a] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Terminal size={12} className="text-[#89b4fa] shrink-0" />
          <span className="text-xs font-medium text-[#cdd6f4] truncate">{snippet.name}</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#a6e3a1] transition-colors"
            title="Copy"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={handleSend}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#89b4fa] transition-colors"
            title="Send to Terminal"
          >
            <Terminal size={12} />
          </button>
          <button
            onClick={() => deleteSnippet(snippet.id)}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#f38ba8] transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <pre className="text-[10px] text-[#a6adc8] bg-[#1e1e2e] rounded px-2 py-1 overflow-x-auto font-mono">
        {snippet.command}
      </pre>
      {snippet.description && (
        <div className="text-[10px] text-[#6c7086] mt-1">{snippet.description}</div>
      )}
      {copied && (
        <div className="text-[10px] text-[#a6e3a1] mt-1">Copied!</div>
      )}
    </div>
  )
}

export default function SnippetPanel() {
  const showSnippets = useSettingsStore((s) => s.showSnippets)
  const toggleSnippets = useSettingsStore((s) => s.toggleSnippets)
  const snippets = useSnippetStore((s) => s.snippets)
  const search = useSnippetStore((s) => s.search)
  const setSearch = useSnippetStore((s) => s.setSearch)
  const categoryFilter = useSnippetStore((s) => s.categoryFilter)
  const setCategoryFilter = useSnippetStore((s) => s.setCategoryFilter)
  const categories = useSnippetStore((s) => s.categories)
  const saveSnippet = useSnippetStore((s) => s.saveSnippet)
  const activeTabId = useTerminalStore((s) => s.activeTabId)

  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState('general')

  // Prompt state
  const [promptSnippet, setPromptSnippet] = useState<{
    snippet: Snippet
    variables: string[]
    actionType: 'send' | 'copy'
  } | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    let result = snippets
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q)
      )
    }
    if (categoryFilter) {
      result = result.filter((s) => s.category === categoryFilter)
    }
    return result
  }, [snippets, search, categoryFilter])

  const handleAddSnippet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newCommand.trim()) return
    await saveSnippet({
      name: newName.trim(),
      command: newCommand.trim(),
      description: newDesc.trim(),
      category: newCategory,
      sortOrder: 0
    })
    setNewName('')
    setNewCommand('')
    setNewDesc('')
    setNewCategory('general')
    setShowForm(false)
  }

  const handlePrompt = (snippet: Snippet, variables: string[], actionType: 'send' | 'copy') => {
    // Reset values
    const initialValues: Record<string, string> = {}
    variables.forEach(v => { initialValues[v] = '' })
    setVariableValues(initialValues)
    setPromptSnippet({ snippet, variables, actionType })
  }

  if (!showSnippets) return null

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-[#181825] border-l border-[#313244] z-40 flex flex-col shadow-2xl relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
        <span className="text-xs font-semibold text-[#cdd6f4]">Snippets</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowForm(!showForm)}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={toggleSnippets}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="px-3 py-2 space-y-2 border-b border-[#313244]">
        <div className="flex items-center gap-1 bg-[#1e1e2e] rounded-md px-2 py-1 border border-[#313244]">
          <Search size={12} className="text-[#6c7086]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none"
            placeholder="Search snippets..."
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              !categoryFilter ? 'bg-[#89b4fa] text-[#1e1e2e]' : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
            }`}
          >
            All
          </button>
          {categories().map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#89b4fa] text-[#1e1e2e]'
                  : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAddSnippet} className="px-3 py-3 space-y-2 border-b border-[#313244] bg-[#1e1e2e]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
            placeholder="Snippet name (dùng {{ten_bien}} cho lệnh động)"
            required
          />
          <textarea
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa] font-mono resize-none"
            rows={2}
            placeholder="curl -I https://{{domain_name}}"
            required
          />
          <div className="flex gap-2">
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="flex-1 bg-[#181825] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] placeholder-[#6c7086] outline-none focus:border-[#89b4fa]"
              placeholder="Description (optional)"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-[#181825] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]"
            >
              <option value="general">general</option>
              <option value="docker">docker</option>
              <option value="git">git</option>
              <option value="nginx">nginx</option>
              <option value="systemd">systemd</option>
              <option value="network">network</option>
              <option value="database">database</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full py-1.5 rounded text-xs font-medium bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors"
          >
            Add Snippet
          </button>
        </form>
      )}

      {/* Snippet list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-[#6c7086] text-xs py-8">
            {search ? 'No snippets found' : 'No snippets yet.\nClick + to add one.'}
          </div>
        )}
        {filtered.map((snippet) => (
          <SnippetCard key={snippet.id} snippet={snippet} onPrompt={handlePrompt} />
        ))}
      </div>

      {/* Variable Prompt Modal */}
      {promptSnippet && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e2e] border border-white/5 rounded-2xl w-full max-w-[300px] flex flex-col shadow-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Nhập tham số</h3>
              <button
                onClick={() => setPromptSnippet(null)}
                className="p-1 rounded hover:bg-white/5 text-[#585b70] hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              {promptSnippet.variables.map((v) => (
                <div key={v} className="space-y-1">
                  <label className="text-[10px] text-[#585b70] font-semibold">{v}</label>
                  <input
                    type="text"
                    value={variableValues[v] || ''}
                    onChange={(e) => setVariableValues({ ...variableValues, [v]: e.target.value })}
                    className="w-full bg-[#181825] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]/50"
                    placeholder={`Nhập ${v}...`}
                    autoFocus={promptSnippet.variables.indexOf(v) === 0}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setPromptSnippet(null)}
                className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  let cmd = promptSnippet.snippet.command
                  promptSnippet.variables.forEach((v) => {
                    const val = variableValues[v] || ''
                    const escapedVar = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    const re = new RegExp(`\\{\\{${escapedVar}\\}\\}`, 'g')
                    cmd = cmd.replace(re, val)
                  })

                  if (promptSnippet.actionType === 'send') {
                    if (activeTabId) {
                      window.api.ssh.shellInput(activeTabId, cmd + '\n')
                    } else {
                      window.api.app.copyToClipboard(cmd)
                    }
                  } else {
                    window.api.app.copyToClipboard(cmd)
                  }
                  setPromptSnippet(null)
                }}
                className="px-3 py-1.5 rounded-lg text-xs bg-[#89b4fa] text-[#1e1e2e] font-semibold hover:bg-[#74c7ec]"
              >
                {promptSnippet.actionType === 'send' ? 'Chạy Lệnh' : 'Copy Lệnh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
