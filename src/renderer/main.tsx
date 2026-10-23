import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installWebApi } from './lib/web-api'
import './styles/index.css'
import 'xterm/css/xterm.css'

// Bridges `window.api` to the Terminux HTTP/WebSocket server.
installWebApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
