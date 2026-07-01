import { create } from 'zustand'
import type { TerminalTab } from '../types'

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabId: string | null
  tabThemes: Record<string, string>  // sessionId → themeId
  addTab: (tab: TerminalTab) => void
  removeTab: (sessionId: string) => void
  setActiveTab: (sessionId: string) => void
  updateTabState: (sessionId: string, partial: Partial<TerminalTab>) => void
  setTabTheme: (sessionId: string, themeId: string) => void
  getTabTheme: (sessionId: string) => string | undefined
  clearTabs: () => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  tabThemes: {},

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.sessionId
    })),

  removeTab: (sessionId) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.sessionId === sessionId)
      const tabs = state.tabs.filter((t) => t.sessionId !== sessionId)
      const { [sessionId]: _, ...tabThemes } = state.tabThemes

      let activeTabId = state.activeTabId
      if (state.activeTabId === sessionId) {
        if (tabs.length > 0) {
          const newIdx = Math.min(idx, tabs.length - 1)
          activeTabId = tabs[newIdx].sessionId
        } else {
          activeTabId = null
        }
      }

      return { tabs, activeTabId, tabThemes }
    }),

  setActiveTab: (sessionId) => set({ activeTabId: sessionId }),

  updateTabState: (sessionId, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.sessionId === sessionId) {
          const nextTab = { ...t, ...partial }
          if (partial.connected === true && !t.connected && t.viewMode === undefined) {
            nextTab.viewMode = 'dashboard'
          }
          return nextTab
        }
        return t
      })
    })),

  setTabTheme: (sessionId, themeId) =>
    set((state) => ({
      tabThemes: { ...state.tabThemes, [sessionId]: themeId },
      tabs: state.tabs.map((t) =>
        t.sessionId === sessionId ? { ...t, themeId } : t
      )
    })),

  getTabTheme: (sessionId) => get().tabThemes[sessionId],

  clearTabs: () => set({ tabs: [], activeTabId: null, tabThemes: {} })
}))
