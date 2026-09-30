import { Bell, ChevronDown, LogOut, Menu, Search, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo.jsx'

function AppHeader({ collapsed, glowArtwork, onArtistSpotlightOpen, onHome, onLogout, onSearchChange, onSidebarToggle, searchQuery, user }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const searchStyle = glowArtwork ? { '--search-glow-image': `url("${glowArtwork}")` } : undefined

  useEffect(() => {
    function closeFromOutside(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    function closeFromKeyboard(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)

    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [])

  return (
    <header className="app-header">
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
        </div>

        <label className={`music-search${glowArtwork ? ' music-search--themed' : ''}`} style={searchStyle}>
          <span className="sr-only">Buscar albumes o artistas</span>
          <Search className="music-search__icon" size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            className="music-search__input"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar albumes o artistas"
            type="search"
            autoComplete="off"
          />
          <span className="music-search__border" aria-hidden="true" />
        </label>

        <div className="app-header__actions">
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
              <strong>Cerrar sesion</strong>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default AppHeader
