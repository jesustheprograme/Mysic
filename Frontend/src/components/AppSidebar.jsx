import { useState } from 'react'
import {
  Album,
  CircleUserRound,
  Clock3,
  Compass,
  Download,
  Heart,
  House,
  Import,
  ListMusic,
  ChartColumn,
  ChevronDown,
  Library,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  UsersRound,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getPlaylistTrackCount } from '../features/playlists/playlistTracks.js'
import { countText, EMPTY_LIBRARY_SUMMARY } from '../features/youtube/librarySummary.js'
import { sizedImage } from '../lib/imageSize.js'
import { readStorage, writeStorage } from '../lib/storage.js'

// Opciones principales: Inicio es la portada de YouTube Music; todo el catálogo propio de Mysic
// vive dentro del desplegable "Mysic".
const mainNavigationItems = [
  { id: 'youtube', label: 'Inicio', icon: House, youtubeView: 'home' },
  { id: 'youtube-explore', label: 'Explorar', icon: Compass, youtubeView: 'explore' },
  { id: 'youtube-library', label: 'Biblioteca', icon: Library, youtubeView: 'library' },
  { id: 'stats', label: 'Estadísticas', icon: ChartColumn },
]

const GROUP_STORAGE_KEY = 'mysic:sidebar:mysic-open'
const MYSIC_SECTIONS = ['home', 'explore', 'for-you', 'import', 'recent', 'albums', 'album', 'artists', 'artist', 'playlists', 'playlist', 'downloads']

const primaryNavigationItems = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'explore', label: 'Explorar', icon: Compass },
  { id: 'for-you', label: 'Favoritas', icon: Heart },
]

const libraryNavigationItems = [
  { id: 'recent', label: 'Historial', icon: Clock3 },
  { id: 'albums', label: 'Álbumes', icon: Album },
  { id: 'artists', label: 'Artistas', icon: UsersRound },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'downloads', label: 'Descargas', icon: Download },
]

function AppSidebar({
  activePlaylistId,
  activeSection,
  canImportMusic = false,
  collapsed,
  mobileOpen = false,
  onCreatePlaylist,
  onEditPlaylist,
  onNavigate,
  onOpenPlaylist,
  onTogglePlaylistPinned,
  onImportNav,
  onMobileClose,
  onYoutubeNavigate,
  playlists = [],
  // Playlists y Me gusta de la cuenta de YouTube Music (se vinculan solos) y cuál de ellos está abierto.
  youtubeActive = null,
  youtubeLibrary = EMPTY_LIBRARY_SUMMARY,
  youtubeView = 'home',
}) {
  const inMysicGroup = MYSIC_SECTIONS.includes(activeSection)
  const [groupOpen, setGroupOpen] = useState(() => readStorage(GROUP_STORAGE_KEY, false) === true)
  // Si estás en una sección de Mysic, el grupo se muestra abierto aunque lo hayas plegado.
  const groupVisible = groupOpen || inMysicGroup

  function toggleGroup() {
    const next = !groupVisible
    setGroupOpen(next)
    writeStorage(GROUP_STORAGE_KEY, next)
  }

  function isItemActive({ id, youtubeView: view }) {
    if (view) {
      if (activeSection !== 'youtube') return false
      // Con una playlist o los Me gusta abiertos, se resalta esa entrada y no la sección desde la que se llegó.
      if (youtubeActive) return false
      const current = youtubeView === 'explore' || youtubeView === 'library' ? youtubeView : 'home'
      return current === view
    }
    return activeSection === id
      || (id === 'playlists' && activeSection === 'playlist')
      || (id === 'albums' && activeSection === 'album')
      || (id === 'artists' && activeSection === 'artist')
  }

  function renderItem(item) {
    const { id, label, icon: Icon, youtubeView: view } = item
    const isActive = isItemActive(item)

    return (
      <button
        className={`app-sidebar__item${isActive ? ' app-sidebar__item--active' : ''}`}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        onClick={() => (view ? onYoutubeNavigate?.(view) : onNavigate(id))}
        title={collapsed ? label : undefined}
        key={id}
      >
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <>
      <button
        className={`app-sidebar__backdrop${mobileOpen ? ' app-sidebar__backdrop--visible' : ''}`}
        type="button"
        aria-label="Cerrar menú de navegación"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onMobileClose}
      />
      <aside
        className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}${mobileOpen ? ' app-sidebar--mobile-open' : ''}`}
        id="mobile-navigation"
      >
        <nav className="app-sidebar__navigation" aria-label="Navegación principal">
          {mainNavigationItems.map(renderItem)}

          <button
            className={`app-sidebar__group-toggle${groupVisible ? ' app-sidebar__group-toggle--open' : ''}`}
            type="button"
            aria-expanded={groupVisible}
            aria-controls="sidebar-mysic-group"
            title={collapsed ? 'Mysic' : undefined}
            onClick={toggleGroup}
          >
            <ListMusic size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>Mysic</span>
            <ChevronDown className="app-sidebar__group-chevron" size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="app-sidebar__group" id="sidebar-mysic-group" hidden={!groupVisible}>
            {primaryNavigationItems.map(renderItem)}
            {canImportMusic && (
              <button
                className={`app-sidebar__item${activeSection === 'import' ? ' app-sidebar__item--active' : ''}`}
                type="button"
                aria-current={activeSection === 'import' ? 'page' : undefined}
                onClick={() => onImportNav?.()}
                title={collapsed ? 'Importar música' : undefined}
                key="import"
              >
                <Import size={19} strokeWidth={1.7} aria-hidden="true" />
                <span>Importar música</span>
              </button>
            )}
            {!collapsed && <p className="app-sidebar__label">Tu música</p>}
            {libraryNavigationItems.map(renderItem)}
          </div>
        </nav>

        {!collapsed && (
          <div className="app-sidebar__playlists">
          <div className="app-sidebar__label-row">
            <p className="app-sidebar__label">Playlists</p>
            <button type="button" aria-label="Crear playlist" title="Crear playlist" onClick={onCreatePlaylist}>
              <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {youtubeLibrary.liked && (
            <div className={`app-sidebar__playlist${activeSection === 'youtube' && youtubeActive?.type === 'liked' ? ' app-sidebar__playlist--active' : ''}`}>
              <button className="app-sidebar__playlist-main" type="button" onClick={() => onYoutubeNavigate?.({ type: 'liked' })}>
                <span className="app-sidebar__playlist-art app-sidebar__playlist-art--liked" aria-hidden="true"><Heart size={16} fill="currentColor" strokeWidth={1.6} /></span>
                <span className="app-sidebar__playlist-copy">
                  <strong>Música que me gusta</strong>
                  <small>{countText(youtubeLibrary.liked.count, youtubeLibrary.liked.hasMore)}</small>
                </span>
              </button>
            </div>
          )}
          {youtubeLibrary.playlists.map((playlist) => (
            <div
              className={`app-sidebar__playlist${activeSection === 'youtube' && youtubeActive?.type === 'playlist' && youtubeActive.id === playlist.id ? ' app-sidebar__playlist--active' : ''}`}
              key={`yt-${playlist.id}`}
            >
              <button className="app-sidebar__playlist-main" type="button" title={playlist.title} onClick={() => onYoutubeNavigate?.({ id: playlist.id, type: 'playlist' })}>
                {playlist.thumbnail ? (
                  <img loading="lazy" decoding="async" className="app-sidebar__playlist-art" src={sizedImage(playlist.thumbnail, 34)} alt="" width="34" height="34" />
                ) : (
                  <span className="app-sidebar__playlist-art" aria-hidden="true" />
                )}
                <span className="app-sidebar__playlist-copy">
                  <strong>{playlist.title}</strong>
                  <small>{countText(playlist.count)}</small>
                </span>
              </button>
            </div>
          ))}
          {playlists.map((playlist) => (
              <div
                className={`app-sidebar__playlist${activePlaylistId === playlist.id ? ' app-sidebar__playlist--active' : ''}`}
                key={playlist.id}
              >
                <button
                  className="app-sidebar__playlist-main"
                  type="button"
                  onClick={() => onOpenPlaylist(playlist.id)}
                >
                  {playlist.artwork ? (
                    <img loading="lazy" decoding="async" className="app-sidebar__playlist-art" src={sizedImage(playlist.artwork, 34)} alt="" width="34" height="34" />
                  ) : (
                    <span className="app-sidebar__playlist-art" aria-hidden="true" />
                  )}
                  <span className="app-sidebar__playlist-copy">
                    <strong>{playlist.title}</strong>
                    <small>{getPlaylistTrackCount(playlist)} canciones</small>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="app-sidebar__playlist-menu-trigger grid size-6 shrink-0 place-items-center rounded-full"
                      type="button"
                      aria-label={`Opciones de ${playlist.title}`}
                      title={`Opciones de ${playlist.title}`}
                    >
                      <MoreVertical size={17} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="app-sidebar__playlist-menu min-w-48"
                    align="end"
                    collisionPadding={8}
                    sideOffset={5}
                  >
                    <DropdownMenuItem
                      className="app-sidebar__playlist-menu-item grid w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-[7px] rounded-sm px-2 py-2 text-left text-[11px] outline-none"
                      onSelect={() => onTogglePlaylistPinned?.(playlist)}
                    >
                      {playlist.pinned ? <PinOff size={15} strokeWidth={1.8} aria-hidden="true" /> : <Pin size={15} strokeWidth={1.8} aria-hidden="true" />}
                      <span>{playlist.pinned ? 'Desfijar' : 'Fijar'}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="app-sidebar__playlist-menu-item grid w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-[7px] rounded-sm px-2 py-2 text-left text-[11px] outline-none"
                      onSelect={() => onEditPlaylist?.(playlist)}
                    >
                      <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
                      <span>Cambiar nombre o portada</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          ))}
          <button className="app-sidebar__create" type="button" onClick={onCreatePlaylist}>
            <CircleUserRound size={18} strokeWidth={1.7} aria-hidden="true" />
            <span>Crear playlist</span>
          </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default AppSidebar
