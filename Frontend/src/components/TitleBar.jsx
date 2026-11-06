import { getCurrentWindow } from '@tauri-apps/api/window'
import { ArrowLeft, ArrowRight, ChevronDown, Copy, LogOut, Minus, RotateCw, Square, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './title-bar.css'

/**
 * Estado de los botones atrás/adelante. WebView2 (Chromium) expone la API de navegación, que sabe
 * si hay entradas previas o siguientes en el historial; si no existe, ambos botones quedan activos.
 */
function useHistoryButtons() {
  const read = () => {
    const navigation = window.navigation
    return navigation
      ? { canGoBack: navigation.canGoBack, canGoForward: navigation.canGoForward }
      : { canGoBack: true, canGoForward: true }
  }
  const [state, setState] = useState(read)

  useEffect(() => {
    const update = () => setState(read())
    const navigation = window.navigation
    navigation?.addEventListener('currententrychange', update)
    window.addEventListener('popstate', update)
    window.addEventListener('hashchange', update)
    update()
    return () => {
      navigation?.removeEventListener('currententrychange', update)
      window.removeEventListener('popstate', update)
      window.removeEventListener('hashchange', update)
    }
  }, [])

  return {
    ...state,
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    // Recarga completa de la interfaz: la ruta y la canción seleccionada se restauran solas,
    // pero la reproducción en curso se detiene.
    reload: () => window.location.reload(),
  }
}

function useWindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let unlisten
    let cancelled = false

    const sync = () => appWindow.isMaximized().then((value) => { if (!cancelled) setMaximized(value) }).catch(() => {})
    sync()
    appWindow.onResized(sync).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    }).catch(() => {})

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return {
    close: () => getCurrentWindow().close(),
    maximized,
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  }
}

function UserMenu({ onLogout, user }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeFromKeyboard = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [open])

  return (
    <div className="titlebar__user" ref={rootRef}>
      <button
        className="titlebar__user-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Abrir menú de ${user.username}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="titlebar__avatar">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            : <UserRound size={13} strokeWidth={1.9} aria-hidden="true" />}
        </span>
        <span className="titlebar__username">{user.username}</span>
        <ChevronDown className={`titlebar__chevron${open ? ' titlebar__chevron--open' : ''}`} size={14} strokeWidth={1.9} aria-hidden="true" />
      </button>

      {open && (
        <div className="titlebar__menu" role="menu" aria-label="Menú de perfil">
          <button className="titlebar__menu-item titlebar__menu-item--danger" type="button" role="menuitem" onClick={onLogout}>
            <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Barra de título propia de la app de escritorio (la ventana no usa la barra nativa).
 * Estructura tomada de Titlebar.svelte de limusic: toda la barra es zona de arrastre
 * (doble clic maximiza), el usuario y los controles de ventana quedan a la derecha.
 * Los botones y el menú no son zona de arrastre: solo lo es el fondo de la barra.
 */
export default function TitleBar({ onLogout, user }) {
  const controls = useWindowControls()
  const history = useHistoryButtons()

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <img className="titlebar__icon" src="/favicon.svg" alt="" draggable="false" />
        <button className="titlebar__nav" type="button" aria-label="Atrás" title="Atrás" disabled={!history.canGoBack} onClick={history.back}>
          <ArrowLeft size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button className="titlebar__nav" type="button" aria-label="Adelante" title="Adelante" disabled={!history.canGoForward} onClick={history.forward}>
          <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button className="titlebar__nav" type="button" aria-label="Recargar" title="Recargar" onClick={history.reload}>
          <RotateCw size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {/* Título centrado sobre toda la barra, como en limusic; no intercepta clics. */}
      <span className="titlebar__title" aria-hidden="true">Mysic</span>

      <div className="titlebar__right">
        {user && <UserMenu onLogout={onLogout} user={user} />}
        <span className="titlebar__separator" aria-hidden="true" />
        <button className="titlebar__control" type="button" aria-label="Minimizar" title="Minimizar" onClick={controls.minimize}>
          <Minus size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          className="titlebar__control"
          type="button"
          aria-label={controls.maximized ? 'Restaurar' : 'Maximizar'}
          title={controls.maximized ? 'Restaurar' : 'Maximizar'}
          onClick={controls.toggleMaximize}
        >
          {controls.maximized
            ? <Copy size={14} strokeWidth={1.8} aria-hidden="true" />
            : <Square size={14} strokeWidth={1.8} aria-hidden="true" />}
        </button>
        <button className="titlebar__control titlebar__control--close" type="button" aria-label="Cerrar" title="Cerrar" onClick={controls.close}>
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
