import { create } from 'zustand'
import type { Snippet } from '../types'

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface SnippetStore {
  snippets: Snippet[]
  search: string
  categoryFilter: string
  loading: boolean
  loadSnippets: () => Promise<void>
  saveSnippet: (snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  deleteSnippet: (id: string) => Promise<void>
  setSearch: (search: string) => void
  setCategoryFilter: (category: string) => void
  categories: () => string[]
}

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  search: '',
  categoryFilter: '',
  loading: false,

  loadSnippets: async () => {
    let rows
    const { search, categoryFilter } = get()
    if (categoryFilter) {
      rows = await window.api.db.all(
        'SELECT * FROM snippets WHERE category=? ORDER BY sort_order ASC, name ASC',
        [categoryFilter]
      )
    } else {
      rows = await window.api.db.all(
        'SELECT * FROM snippets ORDER BY sort_order ASC, name ASC'
      )
    }
    set({
      snippets: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        command: r.command,
        description: r.description,
        category: r.category,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    })
  },

  saveSnippet: async (snippet) => {
    if (snippet.id) {
      await window.api.db.run(
        `UPDATE snippets SET name=?, command=?, description=?, category=?, updated_at=datetime('now') WHERE id=?`,
        [snippet.name, snippet.command, snippet.description, snippet.category, snippet.id]
      )
    } else {
      const id = generateId()
      await window.api.db.run(
        `INSERT INTO snippets (id, name, command, description, category) VALUES (?, ?, ?, ?, ?)`,
        [id, snippet.name, snippet.command, snippet.description, snippet.category]
      )
    }
    await get().loadSnippets()
  },

  deleteSnippet: async (id) => {
    await window.api.db.run('DELETE FROM snippets WHERE id=?', [id])
    await get().loadSnippets()
  },

  setSearch: (search) => set({ search }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),

  categories: () => {
    const cats = new Set(get().snippets.map((s) => s.category))
    return Array.from(cats).sort()
  }
}))
