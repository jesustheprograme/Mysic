import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API_URL } from './lib/api.js'
import { startWarmup } from './lib/warmup.js'

// Solo la aplicación principal: el mini reproductor, el login de escritorio y la demo
// son ventanas/rutas aparte y no necesitan estos chunks.
const isMainApp = !window.__MYSIC_MINI_PLAYER__
  && !['#/mini-player', '#/demo/nuevo-artista'].includes(window.location.hash)
  && !window.location.hash.startsWith('#/desktop-auth')

// En la ruta crítica: se piden ya, en paralelo con la sesión, y React.lazy reutiliza el mismo módulo.
// Sin esto la interfaz esperaría al login para empezar a descargar su propio código, y la sección
// YouTube Music (la de inicio) esperaría además a que DiscoveryView terminara de cargar.
if (isMainApp) {
  // Si falla la red, React.lazy volverá a pedirlos cuando se necesiten.
  import('./features/discovery/DiscoveryView.jsx').catch(() => {})
  import('./features/youtube/YoutubeView.jsx').catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (isMainApp) {
  startWarmup({
    apiUrl: API_URL,
    // Fuera de la ruta crítica: el reproductor solo hace falta al reproducir la primera canción local.
    loaders: [() => import('./components/PlayerDock.jsx')],
  })
}
