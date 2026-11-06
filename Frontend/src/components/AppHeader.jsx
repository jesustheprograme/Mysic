import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo.jsx'
import { DesktopAppHeaderLink } from './DesktopAppDownload.jsx'
import ShortcutsHelp from '../features/shortcuts/ShortcutsHelp.jsx'
import { matchShortcut } from '../features/shortcuts/shortcuts.js'
import { isDesktopShell } from '../lib/desktopShell.js'

function AppHeader({
  collapsed,
  mobileBrandHidden,
  mobileContextTitle,
  mobileMenuOpen,
  onHome,
  onLogout,
  onMobileMenuClose,
  onMobileMenuToggle,
  onSearchChange,
  onSearchSubmit,
  onSidebarToggle,
  searchQuery,
  user,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const menuRef = useRef(null)
  const searchInputRef = useRef(null)
  // En escritorio el usuario y su menú viven en la barra de título (TitleBar), no aquí.
  const desktopShell = isDesktopShell()

  useEffect(() => {
    function closeFromOutside(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    function closeFromKeyboard(event) {
      const shortcut = matchShortcut(event)
      if (shortcut === 'search') {
        event.preventDefault()
        setSearchOpen(true)
        // Espera al render: en móvil el campo solo existe con la búsqueda abierta.
        requestAnimationFrame(() => {
          const input = document.querySelector('#global-header-search-root .yt-music-search input')
          input?.focus()
          input?.select?.()
        })
        return
      }
      if (shortcut === 'help') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }

      if (event.key === 'Escape') {
        setMenuOpen(false)
        setSearchOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)

    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [])

  useEffect(() => {
    if (searchOpen) {
      const globalSearchInput = document.querySelector('#global-header-search-root .yt-music-search input')
      if (globalSearchInput) globalSearchInput.focus()
      else searchInputRef.current?.focus()
    }
  }, [searchOpen])

  function toggleMobileSearch() {
    const nextOpen = !searchOpen
    setSearchOpen(nextOpen)
    if (nextOpen) onMobileMenuClose?.()
  }

  return (
    <>
    <header className={`app-header${searchOpen ? ' app-header--search-open' : ''}${mobileBrandHidden ? ' app-header--brand-hidden' : ''}${desktopShell ? ' app-header--desktop-shell' : ''}`}>
      <div className="app-header__inner">
        <div className="app-header__leading">
          <button
            className="app-header__toggle"
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mostrar sidebar' : 'Ocultar sidebar'}
            title={collapsed ? 'Mostrar sidebar' : 'Ocultar sidebar'}
            onClick={onSidebarToggle}
          >
            {collapsed
              ? <PanelLeftOpen size={20} strokeWidth={1.8} aria-hidden="true" />
              : <PanelLeftClose size={20} strokeWidth={1.8} aria-hidden="true" />}
          </button>

          <button
            className="app-header__mobile-menu-toggle"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            title={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => {
              setSearchOpen(false)
              onMobileMenuToggle?.()
            }}
          >
            <Menu size={23} strokeWidth={1.8} aria-hidden="true" />
          </button>

          <div className="app-header__identity">
            <a
              className="app-header__brand"
              href="#music-home"
              aria-label="Inicio de Mysic"
              onClick={(event) => {
                event.preventDefault()
                onHome()
              }}
            >
              <BrandLogo className="app-header__logo" tone="light" />
            </a>
            <strong className="app-header__context-title" aria-hidden={!mobileBrandHidden}>
              {mobileContextTitle}
            </strong>
          </div>
        </div>

        <div
          className={`music-search${searchOpen ? ' music-search--open' : ''}`}
          id="global-header-search-root"
        >
          <form
            className="app-header__search-fallback"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              onSearchSubmit?.(searchQuery)
              setSearchOpen(false)
            }}
          >
            <label className="sr-only" htmlFor="global-header-search">Buscar en Mysic</label>
            <Search className="music-search__icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            <input
              id="global-header-search"
              className="music-search__input"
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Canciones, artistas, álbumes…"
              type="search"
              autoComplete="off"
            />
            <span className="music-search__border" aria-hidden="true" />
          </form>
        </div>

        <button
          className="app-header__search-toggle"
          type="button"
          aria-controls="global-header-search-root"
          aria-expanded={searchOpen}
          aria-label={searchOpen ? 'Ocultar buscador' : 'Abrir buscador'}
          title={searchOpen ? 'Ocultar buscador' : 'Buscar'}
          onClick={toggleMobileSearch}
        >
          <Search size={21} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <div className="app-header__actions">
          <DesktopAppHeaderLink />
        </div>

        {!desktopShell && <div className="profile-menu" ref={menuRef}>
          <button
            className="profile-menu__trigger"
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Abrir menu de ${user.username}`}
            title={user.username}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="profile-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <UserRound size={18} strokeWidth={1.7} aria-hidden="true" />
              )}
            </span>
            <ChevronDown
              className={`profile-menu__chevron${menuOpen ? ' profile-menu__chevron--open' : ''}`}
              size={15}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          <div
            className={`profile-menu__popover${menuOpen ? ' profile-menu__popover--open' : ''}`}
            role="menu"
            aria-label="Menu de perfil"
            aria-hidden={!menuOpen}
            inert={!menuOpen}
          >
            <button className="profile-menu__logout" type="button" role="menuitem" onClick={onLogout}>
              <LogOut size={17} strokeWidth={1.7} aria-hidden="true" />
              <strong>Cerrar sesión</strong>
            </button>
          </div>
        </div>}
      </div>
    </header>
    {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </>
  )
}

export default AppHeader
