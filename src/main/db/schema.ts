export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL DEFAULT 'root',
  auth_method TEXT DEFAULT 'password',
  password TEXT,
  private_key_path TEXT,
  passphrase TEXT,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  color TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS terminal_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_builtin INTEGER DEFAULT 0,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_history (
  id TEXT PRIMARY KEY,
  host_name TEXT NOT NULL,
  host_address TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
`

export const DEFAULT_SETTINGS: Record<string, string> = {
  theme: 'one-dark',
  font_family: 'JetBrains Mono, Menlo, monospace',
  font_size: '14',
  cursor_style: 'block',
  cursor_blink: 'true',
  opacity: '1.0',
  background_image: '',
  background_blur: '0'
}

export const BUILTIN_THEMES = [
  {
    id: 'one-dark',
    name: 'One Dark',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: '#3e4451',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff'
    })
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3'
    })
  },
  {
    id: 'dracula',
    name: 'Dracula',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff'
    })
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#45475a',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8'
    })
  },
  {
    id: 'terminux-seamless',
    name: 'Terminux Seamless',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#11111b',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#313244',
      black: '#313244',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#cdd6f4',
      brightBlack: '#45475a',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#ffffff'
    })
  },
  {
    id: 'nord',
    name: 'Nord',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#88c0d0',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4'
    })
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#fe8019',
      selectionBackground: '#504945',
      black: '#282828',
      red: '#cc241d',
      green: '#98971a',
      yellow: '#d79921',
      blue: '#458588',
      magenta: '#b16286',
      cyan: '#689d6a',
      white: '#a89984',
      brightBlack: '#928374',
      brightRed: '#fb4934',
      brightGreen: '#b8bb26',
      brightYellow: '#fabd2f',
      brightBlue: '#83a598',
      brightMagenta: '#d3869b',
      brightCyan: '#8ec07c',
      brightWhite: '#ebdbb2'
    })
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      selectionBackground: '#343b58',
      black: '#1a1b26',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5'
    })
  },
  {
    id: 'aura-dark',
    name: 'Aura Dark',
    is_builtin: 1,
    config: JSON.stringify({
      background: '#15141b',
      foreground: '#edecee',
      cursor: '#a277ff',
      selectionBackground: '#322d43',
      black: '#110f18',
      red: '#ff6767',
      green: '#61ffca',
      yellow: '#ffca85',
      blue: '#a277ff',
      magenta: '#a277ff',
      cyan: '#61ffca',
      white: '#edecee',
      brightBlack: '#4d4d4d',
      brightRed: '#ff6767',
      brightGreen: '#61ffca',
      brightYellow: '#ffca85',
      brightBlue: '#a277ff',
      brightMagenta: '#a277ff',
      brightCyan: '#61ffca',
      brightWhite: '#ffffff'
    })
  }
]
