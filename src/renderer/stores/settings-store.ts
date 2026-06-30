import { create } from 'zustand'
import type { TerminalTheme, ThemeConfig } from '../types'

interface SettingsStore {
  theme: string
  themeConfig: ThemeConfig | null
  themes: TerminalTheme[]
  fontFamily: string
  fontSize: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  opacity: number
  backgroundImage: string
  backgroundBlur: number
  showSnippets: boolean
  showSettings: boolean
  loadSettings: () => Promise<void>
  loadThemes: () => Promise<void>
  setTheme: (id: string) => Promise<void>
  setFontFamily: (font: string) => Promise<void>
  setFontSize: (size: number) => Promise<void>
  setCursorStyle: (style: 'block' | 'underline' | 'bar') => Promise<void>
  setCursorBlink: (blink: boolean) => Promise<void>
  setOpacity: (opacity: number) => Promise<void>
  setBackgroundImage: (path: string) => Promise<void>
  setBackgroundBlur: (blur: number) => Promise<void>
  toggleSnippets: () => void
  toggleSettings: () => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: 'one-dark',
  themeConfig: null,
  themes: [],
  fontFamily: 'JetBrains Mono, Menlo, monospace',
  fontSize: 14,
  cursorStyle: 'block',
  cursorBlink: true,
  opacity: 1,
  backgroundImage: '',
  backgroundBlur: 0,
  showSnippets: false,
  showSettings: false,

  loadSettings: async () => {
    const rows = await window.api.db.all('SELECT * FROM app_settings')
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value

    set({
      fontFamily: map.font_family ?? 'JetBrains Mono, Menlo, monospace',
      fontSize: parseInt(map.font_size ?? '14'),
      cursorStyle: (map.cursor_style ?? 'block') as any,
      cursorBlink: map.cursor_blink === 'true',
      opacity: parseFloat(map.opacity ?? '1.0'),
      backgroundImage: map.background_image ?? '',
      backgroundBlur: parseInt(map.background_blur ?? '0'),
      theme: map.theme ?? 'one-dark'
    })

    // Load theme config
    await get().loadThemes()
  },

  loadThemes: async () => {
    const themes = await window.api.app.listThemes()
    const { theme } = get()
    const active = themes.find((t) => t.id === theme)
    let themeConfig: ThemeConfig | null = null
    if (active) {
      themeConfig = JSON.parse(active.config)
    }
    set({ themes, themeConfig })
  },

  setTheme: async (id) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('theme', ?)", [id])
    set({ theme: id })
    await get().loadThemes()
  },

  setFontFamily: async (font) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('font_family', ?)", [font])
    set({ fontFamily: font })
  },

  setFontSize: async (size) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('font_size', ?)", [String(size)])
    set({ fontSize: size })
  },

  setCursorStyle: async (style) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('cursor_style', ?)", [style])
    set({ cursorStyle: style })
  },

  setCursorBlink: async (blink) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('cursor_blink', ?)", [String(blink)])
    set({ cursorBlink: blink })
  },

  setOpacity: async (opacity) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('opacity', ?)", [String(opacity)])
    set({ opacity })
  },

  setBackgroundImage: async (path) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('background_image', ?)", [path])
    set({ backgroundImage: path })
  },

  setBackgroundBlur: async (blur) => {
    await window.api.db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('background_blur', ?)", [String(blur)])
    set({ backgroundBlur: blur })
  },

  toggleSnippets: () => set((s) => ({ showSnippets: !s.showSnippets })),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings }))
}))
