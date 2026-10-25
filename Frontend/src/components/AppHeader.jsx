import { Bell, ChevronDown, LogOut, Menu, Search, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo.jsx'
import { DesktopAppHeaderLink } from './DesktopAppDownload.jsx'

function AppHeader({
  collapsed,
  mobileBrandHidden,
  mobileContextTitle,
  mobileMenuOpen,
  onArtistSpotlightOpen,
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
  const menuRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    function closeFromOutside(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    function closeFromKeyboard(event) {
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
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  function toggleMobileSearch() {
    const nextOpen = !searchOpen
    setSearchOpen(nextOpen)
    if (nextOpen) onMobileMenuClose?.()
  }

  return (
    <header className={`app-header${searchOpen ? ' app-header--search-open' : ''}${mobileBrandHidden ? ' app-header--brand-hidden' : ''}`}>
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
            <Menu size={23} strokeWidth={1.8} aria-hidden="true" />
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

        <form
          className={`music-search${searchOpen ? ' music-search--open' : ''}`}
          id="mobile-catalog-search"
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

        <button
          className="app-header__search-toggle"
          type="button"
          aria-controls="mobile-catalog-search"
          aria-expanded={searchOpen}
          aria-label={searchOpen ? 'Ocultar buscador' : 'Abrir buscador'}
          title={searchOpen ? 'Ocultar buscador' : 'Buscar'}
          onClick={toggleMobileSearch}
        >
          <Search size={21} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <div className="app-header__actions">
          <DesktopAppHeaderLink />
          <button
            className="header-icon-button"
            type="button"
            aria-label="Presentación del artista nuevo"
            title="Artista nuevo"
            onClick={onArtistSpotlightOpen}
          >
            <Sparkles size={19} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button className="header-icon-button" type="button" aria-label="Notificaciones" title="Notificaciones">
            <Bell size={19} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <div className="profile-menu" ref={menuRef}>
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
        </div>
      </div>
    </header>
  )
}

export default AppHeader
