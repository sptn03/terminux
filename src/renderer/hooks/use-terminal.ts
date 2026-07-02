import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '../stores/settings-store'
import { useTerminalStore } from '../stores/terminal-store'

interface UseTerminalOptions {
  sessionId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function useTerminal({ sessionId, containerRef }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const fontFamily = useSettingsStore((s) => s.fontFamily)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const cursorStyle = useSettingsStore((s) => s.cursorStyle)
  const cursorBlink = useSettingsStore((s) => s.cursorBlink)
  const themes = useSettingsStore((s) => s.themes)
  const globalTheme = useSettingsStore((s) => s.theme)
  const tabTheme = useTerminalStore((s) => (sessionId ? s.tabThemes[sessionId] : undefined))
  const setTabTheme = useTerminalStore((s) => s.setTabTheme)
  const tab = useTerminalStore((s) => (sessionId ? s.tabs.find((t) => t.sessionId === sessionId) : undefined))
  const startupSentRef = useRef<Record<string, boolean>>({})

  // Resolve theme for this tab
  const activeThemeId = tabTheme ?? globalTheme
  const themeEntry = themes.find((t) => t.id === activeThemeId)
  const themeConfig = themeEntry ? JSON.parse(themeEntry.config) : undefined

  // Init terminal (once)
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return
    const term = new Terminal({
      fontFamily, fontSize, cursorStyle, cursorBlink,
      theme: themeConfig,
      allowTransparency: true, allowProposedApi: true,
      cols: 120, rows: 32,
      disableStdin: false, convertEol: true, screenReaderMode: false
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    try {
      if (containerRef.current.clientWidth > 100 && containerRef.current.clientHeight > 100) {
        fitAddon.fit()
      }
    } catch {}
    if (!sessionId) {
      term.write('Terminux SSH Client\r\n\r\nConnect to a host from the sidebar or use Quick Connect.\r\n\r\n')
    }
    const onResize = () => {
      try {
        if (containerRef.current && containerRef.current.clientWidth > 100 && containerRef.current.clientHeight > 100) {
          fitAddon.fit()
        }
      } catch {}
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(() => {
      try {
        if (containerRef.current && containerRef.current.clientWidth > 100 && containerRef.current.clientHeight > 100) {
          fitAddon.fit()
        }
      } catch {}
    })
    if (containerRef.current) ro.observe(containerRef.current)
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Apply theme/settings (no re-init)
  useEffect(() => { if (terminalRef.current && themeConfig) terminalRef.current.options.theme = themeConfig }, [themeConfig])
  useEffect(() => { if (terminalRef.current) terminalRef.current.options.fontFamily = fontFamily }, [fontFamily])
  useEffect(() => { if (terminalRef.current) terminalRef.current.options.fontSize = fontSize }, [fontSize])
  useEffect(() => { if (terminalRef.current) terminalRef.current.options.cursorStyle = cursorStyle }, [cursorStyle])
  useEffect(() => { if (terminalRef.current) terminalRef.current.options.cursorBlink = cursorBlink }, [cursorBlink])

  // SSH lifecycle (stable — no theme deps)
  useEffect(() => {
    const term = terminalRef.current
    const fit = fitAddonRef.current
    if (!term || !sessionId) return

    // Fit terminal when SSH connects (container may have just become visible)
    const fitTimer = setTimeout(() => {
      try {
        if (containerRef.current && containerRef.current.clientWidth > 100 && containerRef.current.clientHeight > 100) {
          fit?.fit()
        }
      } catch {}
      // Dispatch another fit after layout settles
      setTimeout(() => {
        try {
          if (containerRef.current && containerRef.current.clientWidth > 100 && containerRef.current.clientHeight > 100) {
            fit?.fit()
          }
        } catch {}
      }, 100)
    }, 50)

    const unsubOutput = window.api.ssh.onOutput((sid, data) => { if (sid === sessionId) term.write(data) })
    const unsubExit = window.api.ssh.onExit((sid) => { if (sid === sessionId) term.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n') })
    const unsubError = window.api.ssh.onError((sid, err) => { if (sid === sessionId) term.write(`\r\n\x1b[31m[Error: ${err}]\x1b[0m\r\n`) })
    const unsubData = term.onData((data) => window.api.ssh.shellInput(sessionId, data))
    const unsubResize = term.onResize(({ cols, rows }) => { if (cols > 0 && rows > 0) window.api.ssh.shellResize(sessionId, cols, rows) })
    const keyHandler = term.onKey(({ key, domEvent }) => {
      if ((domEvent.ctrlKey && domEvent.shiftKey && key.toLowerCase() === 'c') || (domEvent.ctrlKey && domEvent.code === 'Insert')) {
        const sel = term.getSelection(); if (sel) { window.api.app.copyToClipboard(sel); domEvent.preventDefault() }
      }
      if (domEvent.ctrlKey && !domEvent.shiftKey && key === '\x03') {
        const sel = term.getSelection(); if (sel) { window.api.app.copyToClipboard(sel); domEvent.preventDefault() }
      }
    })
    const pasteHandler = (e: ClipboardEvent) => { e.preventDefault(); const text = e.clipboardData?.getData('text/plain'); if (text && sessionId) window.api.ssh.shellInput(sessionId, text) }
    term.element?.addEventListener('paste', pasteHandler as EventListener)
    const docPasteHandler = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement
      if (t && term.element?.contains(t)) { e.preventDefault(); const text = e.clipboardData?.getData('text/plain'); if (text && sessionId) window.api.ssh.shellInput(sessionId, text) }
    }
    document.addEventListener('paste', docPasteHandler)
    return () => {
      clearTimeout(fitTimer)
      unsubOutput(); unsubExit(); unsubError(); unsubData.dispose(); unsubResize.dispose(); keyHandler.dispose()
      term.element?.removeEventListener('paste', pasteHandler as EventListener)
      document.removeEventListener('paste', docPasteHandler)
    }
  }, [sessionId])

  // Run startup command if connection succeeds
  useEffect(() => {
    if (sessionId && tab) {
      if (tab.connected && tab.startupCommand && !startupSentRef.current[sessionId]) {
        startupSentRef.current[sessionId] = true
        setTimeout(() => {
          window.api.ssh.shellInput(sessionId, tab.startupCommand + '\n')
        }, 600)
      } else if (!tab.connected) {
        startupSentRef.current[sessionId] = false
      }
    }
  }, [sessionId, tab?.connected, tab?.startupCommand])

  // Context menu (theme change → rebuild menu, not SSH)
  useEffect(() => {
    const term = terminalRef.current
    if (!term || !sessionId) return
    const menuEl = document.createElement('div')
    menuEl.className = 'fixed z-[100] bg-[#1e1e2e] border border-white/[0.08] rounded-xl shadow-2xl py-1 min-w-[190px] hidden text-xs slide-up'
    const showMenu = (x: number, y: number) => {
      while (menuEl.firstChild) menuEl.removeChild(menuEl.firstChild)
      const selection = term.getSelection()
      if (selection) {
        const cb = document.createElement('button')
        cb.className = 'w-full flex items-center gap-2 px-3 py-1.5 text-[#cdd6f4] hover:bg-white/5 text-left'
        cb.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy'
        cb.onclick = () => { window.api.app.copyToClipboard(selection); menuEl.classList.add('hidden') }
        menuEl.appendChild(cb)
      }
      const pb = document.createElement('button')
      pb.className = 'w-full flex items-center gap-2 px-3 py-1.5 text-[#cdd6f4] hover:bg-white/5 text-left'
      pb.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg> Paste'
      pb.onclick = async () => { menuEl.classList.add('hidden'); try { const text = await navigator.clipboard.readText(); if (text && sessionId) window.api.ssh.shellInput(sessionId, text) } catch {} }
      menuEl.appendChild(pb)

      const tab = useTerminalStore.getState().tabs.find((t) => t.sessionId === sessionId)
      if (tab && tab.config) {
        const rb = document.createElement('button')
        rb.className = 'w-full flex items-center gap-2 px-3 py-1.5 text-[#cdd6f4] hover:bg-white/5 text-left'
        rb.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Reconnect'
        rb.onclick = async () => {
          menuEl.classList.add('hidden')
          const updateTabState = useTerminalStore.getState().updateTabState
          let password = tab.config.password
          if (tab.config.authMethod === 'password' && !password) {
            updateTabState(sessionId, { loading: false, connected: false, config: { ...tab.config, password: '' } })
            return
          }

          updateTabState(sessionId, { loading: true, connected: false })
          term.clear()
          term.writeln('Đang kết nối lại...\r\n')

          await window.api.ssh.disconnect(sessionId)
          const result = await window.api.ssh.connect({ ...tab.config, password })

          updateTabState(sessionId, {
            connected: !result.error,
            loading: false,
            label: result.error ? `${tab.label.replace(' (error)', '')} (error)` : tab.label.replace(' (error)', '')
          })
        }
        menuEl.appendChild(rb)
      }

      const sep = document.createElement('div')
      sep.className = 'h-px bg-white/[0.04] my-1'; menuEl.appendChild(sep)

      const label = document.createElement('div')
      label.className = 'px-3 py-1 text-[#585b70] text-[9px] uppercase tracking-widest'
      label.textContent = 'Theme cho tab này'; menuEl.appendChild(label)

      for (const t of themes) {
        const btn = document.createElement('button')
        const isActive = t.id === activeThemeId
        btn.className = `w-full flex items-center gap-2 px-3 py-1 text-left transition-colors ${isActive ? 'text-[#89b4fa] bg-white/5' : 'text-[#cdd6f4] hover:bg-white/[0.03]'}`
        btn.innerHTML = `<span>${isActive ? '●' : '○'}</span><span style="margin-left: 6px">${t.name}</span>`
        btn.onclick = () => { setTabTheme(sessionId, t.id); menuEl.classList.add('hidden') }
        menuEl.appendChild(btn)
      }
      menuEl.style.left = x + 'px'; menuEl.style.top = y + 'px'
      menuEl.classList.remove('hidden')
    }
    const ctxHandler = (e: MouseEvent) => { e.preventDefault(); showMenu(e.clientX, e.clientY) }
    const hide = () => menuEl.classList.add('hidden')
    document.body.appendChild(menuEl)
    term.element?.addEventListener('contextmenu', ctxHandler)
    document.addEventListener('click', hide)
    return () => { term.element?.removeEventListener('contextmenu', ctxHandler); document.removeEventListener('click', hide); document.body.removeChild(menuEl) }
  }, [sessionId, themes, activeThemeId])

  const fit = useCallback(() => { try { fitAddonRef.current?.fit() } catch {} }, [])
  return { terminal: terminalRef.current, fit, clear: () => terminalRef.current?.clear(), writeln: (text: string) => terminalRef.current?.writeln(text) }
}
