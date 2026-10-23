/**
 * In-app path picker for the server filesystem.
 *
 * A browser cannot open a native file dialog, so `app.selectFile` and
 * `local.selectDir` use this modal instead. It browses the machine running the
 * Terminux server through the existing `local:listDir` / `local:getDrives` API.
 */
import type { LocalEntry } from '../types'

export interface PickPathOptions {
  mode: 'file' | 'dir'
  startPath?: string
  title?: string
}

function parentOf(target: string): string {
  const trimmed = target.replace(/[\\/]+$/, '')
  if (!trimmed || /^[A-Za-z]:$/.test(trimmed)) return trimmed
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (idx <= 0) return trimmed.startsWith('/') ? '/' : trimmed
  return trimmed.slice(0, idx)
}

export function pickPath(options: PickPathOptions): Promise<string | null> {
  return new Promise((resolvePromise) => {
    let current = options.startPath || ''

    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;'

    const panel = document.createElement('div')
    panel.style.cssText =
      'width:560px;max-width:92vw;height:520px;max-height:86vh;display:flex;flex-direction:column;' +
      'background:#1e1e2e;border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;' +
      'box-shadow:0 24px 60px rgba(0,0,0,0.5);color:#cdd6f4;font-size:12px;'

    const header = document.createElement('div')
    header.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);'
    const title = document.createElement('div')
    title.textContent = options.title || 'Chọn đường dẫn trên máy chủ'
    title.style.cssText = 'font-weight:600;color:#a6adc8;'
    header.appendChild(title)

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);'

    const btnStyle =
      'padding:4px 9px;border-radius:8px;background:rgba(255,255,255,0.05);color:#a6adc8;cursor:pointer;white-space:nowrap;'
    const upButton = document.createElement('button')
    upButton.textContent = '↑ Lên'
    upButton.style.cssText = btnStyle

    const pathInput = document.createElement('input')
    pathInput.spellcheck = false
    pathInput.placeholder = '/duong/dan'
    pathInput.style.cssText =
      'flex:1;min-width:0;background:#11111b;border:1px solid rgba(255,255,255,0.06);border-radius:8px;' +
      'padding:5px 8px;color:#cdd6f4;outline:none;font-family:ui-monospace,monospace;'

    const goButton = document.createElement('button')
    goButton.textContent = 'Mở'
    goButton.style.cssText = btnStyle

    toolbar.append(upButton, pathInput, goButton)

    const list = document.createElement('div')
    list.style.cssText = 'flex:1;overflow:auto;padding:6px 4px;'

    const footer = document.createElement('div')
    footer.style.cssText =
      'display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);'
    const status = document.createElement('div')
    status.style.cssText = 'flex:1;color:#585b70;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    const cancelButton = document.createElement('button')
    cancelButton.textContent = 'Huỷ'
    cancelButton.style.cssText = btnStyle
    const selectButton = document.createElement('button')
    selectButton.textContent = options.mode === 'dir' ? 'Chọn thư mục này' : 'Chọn'
    selectButton.style.cssText = btnStyle + 'background:#89b4fa;color:#11111b;font-weight:600;'
    footer.append(status, cancelButton, selectButton)

    panel.append(header, toolbar, list, footer)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    let highlightedFile: string | null = null

    const close = (result: string | null) => {
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      resolvePromise(result)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null)
    }
    document.addEventListener('keydown', onKey)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close(null)
    })
    cancelButton.onclick = () => close(null)
    selectButton.onclick = () => close(options.mode === 'dir' ? current : highlightedFile)

    const rowStyle =
      'display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;cursor:pointer;'

    const render = async () => {
      list.innerHTML = ''
      status.textContent = current || ''
      pathInput.value = current
      highlightedFile = null

      let entries: LocalEntry[] = []
      try {
        entries = await window.api.local.listDir(current)
      } catch (err: any) {
        status.textContent = `Không đọc được thư mục: ${err.message}`
        return
      }

      if (entries.length === 0) {
        const empty = document.createElement('div')
        empty.textContent = '(thư mục trống)'
        empty.style.cssText = 'padding:8px 12px;color:#45475a;'
        list.appendChild(empty)
      }

      for (const entry of entries) {
        const row = document.createElement('div')
        row.style.cssText = rowStyle

        const icon = document.createElement('span')
        icon.textContent = entry.isDirectory ? '📁' : '📄'

        const name = document.createElement('span')
        name.textContent = entry.name
        name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'

        const size = document.createElement('span')
        size.textContent = entry.isDirectory ? '' : `${entry.size} B`
        size.style.cssText = 'color:#585b70;'

        row.append(icon, name, size)
        row.onmouseenter = () => {
          if (highlightedFile !== entry.path) row.style.background = 'rgba(255,255,255,0.04)'
        }
        row.onmouseleave = () => {
          if (highlightedFile !== entry.path) row.style.background = 'transparent'
        }

        row.onclick = () => {
          if (entry.isDirectory) {
            current = entry.path
            render()
            return
          }
          highlightedFile = entry.path
          for (const child of Array.from(list.children)) {
            ;(child as HTMLElement).style.background = 'transparent'
          }
          row.style.background = 'rgba(137,180,250,0.16)'
        }
        if (!entry.isDirectory) {
          row.ondblclick = () => close(entry.path)
        }
        list.appendChild(row)
      }
    }

    upButton.onclick = () => {
      const parent = parentOf(current)
      if (parent && parent !== current) {
        current = parent
        render()
      }
    }
    goButton.onclick = () => {
      current = pathInput.value.trim()
      render()
    }
    pathInput.onkeydown = (event) => {
      if (event.key === 'Enter') {
        current = pathInput.value.trim()
        render()
      }
    }

    // Start at the first drive/root when no path was supplied.
    ;(async () => {
      if (!current) {
        try {
          const drives = await window.api.local.getDrives()
          current = drives[0]?.path || '/'
        } catch {
          current = '/'
        }
      }
      render()
    })()
  })
}
