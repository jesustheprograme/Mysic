import { getCurrentWindow } from '@tauri-apps/api/window'
import { ChevronDown, Copy, LogOut, Minus, Square, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './title-bar.css'

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

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <img className="titlebar__icon" src="/favicon.svg" alt="" draggable="false" />
        <span className="titlebar__title" data-tauri-drag-region>Mysic</span>
      </div>

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
