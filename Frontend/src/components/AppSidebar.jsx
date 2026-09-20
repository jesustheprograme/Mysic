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

const primaryNavigationItems = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'explore', label: 'Explorar', icon: Compass },
  { id: 'for-you', label: 'Favoritas', icon: Heart },
]

const libraryNavigationItems = [
  { id: 'recent', label: 'Historial', icon: Clock3 },
  { id: 'albums', label: 'Albumes', icon: Album },
  { id: 'artists', label: 'Artistas', icon: UsersRound },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'downloads', label: 'Descargas', icon: Download },
]

function AppSidebar({
  activePlaylistId,
  activeSection,
  collapsed,
  onCreatePlaylist,
  onEditPlaylist,
  onNavigate,
  onOpenPlaylist,
  onTogglePlaylistPinned,
  onImportNav,
  playlists = [],
}) {
  function renderItem({ id, label, icon: Icon }) {
    const isActive = activeSection === id
      || (id === 'playlists' && activeSection === 'playlist')
      || (id === 'albums' && activeSection === 'album')

    return (
      <button
        className={`app-sidebar__item${isActive ? ' app-sidebar__item--active' : ''}`}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onNavigate(id)}
        title={collapsed ? label : undefined}
        key={id}
      >
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <aside className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}`}>
      <nav className="app-sidebar__navigation" aria-label="Navegacion principal">
        {primaryNavigationItems.map(renderItem)}
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
        {!collapsed && <p className="app-sidebar__label">Tu musica</p>}
        {libraryNavigationItems.map(renderItem)}
      </nav>

      {!collapsed && (
        <div className="app-sidebar__playlists">
          <div className="app-sidebar__label-row">
            <p className="app-sidebar__label">Playlists</p>
            <button type="button" aria-label="Crear playlist" title="Crear playlist" onClick={onCreatePlaylist}>
              <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
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
                    <img className="app-sidebar__playlist-art" src={playlist.artwork} alt="" />
                  ) : (
                    <span className="app-sidebar__playlist-art" aria-hidden="true" />
                  )}
                  <span className="app-sidebar__playlist-copy">
                    <strong>{playlist.title}</strong>
                    <small>{playlist.songIds.length} canciones</small>
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
  )
}

export default AppSidebar
