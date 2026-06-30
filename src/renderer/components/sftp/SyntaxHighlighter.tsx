import { useMemo } from 'react'

interface Props {
  code: string
  language: string
}

const LANG_MAP: Record<string, string> = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  css: 'css', scss: 'scss', html: 'html', xml: 'xml',
  md: 'markdown', sql: 'sql',
  conf: 'ini', ini: 'ini', cfg: 'ini',
  env: 'ini', dockerfile: 'dockerfile',
}

function highlightCode(code: string, lang: string): string {
  const lines = code.split('\n')

  return lines.map((line) => {
    let h = escapeHtml(line)

    // Comments
    h = h.replace(/(\/\/.*$|#.*$)/g, '<span class="hl-comment">$1</span>')
    h = h.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')

    // Strings
    h = h.replace(/(`[^`]*`|'[^']*'|"[^"]*")/g, '<span class="hl-string">$1</span>')

    // Numbers
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>')

    // Keywords
    const keywords = /\b(as|async|await|break|case|catch|class|const|continue|def|del|elif|else|export|extends|finally|for|from|function|if|import|in|instanceof|interface|let|new|of|return|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield|true|false|null|undefined|import|package|pub|fn|let|mut|impl|struct|enum|match|use)\b/g
    h = h.replace(keywords, '<span class="hl-keyword">$1</span>')

    // Decorators / pragma
    h = h.replace(/(@\w+)/g, '<span class="hl-decorator">$1</span>')

    return h
  }).join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default function SyntaxHighlighter({ code, language }: Props) {
  const lang = LANG_MAP[language] || language || 'text'
  const html = useMemo(() => highlightCode(code, lang), [code, lang])

  return (
    <pre className="text-xs leading-relaxed overflow-auto font-mono">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
