import { lazy, Suspense } from 'react'
import useCatalogo from './estado/catalogo/useCatalogo.js'
import useUserLibrary from './estado/useUserLibrary.js'
import TitleBar from './components/TitleBar.jsx'
import AuthView from './features/auth/AuthView.jsx'
import useAuth from './features/auth/useAuth.js'
import { isDesktopShell } from './lib/desktopShell.js'
import './styles/app.css'

// DiscoveryView arrastra casi toda la interfaz (y home.css, ~300 kB de CSS). Cargarlo aparte
// acelera la pantalla de login y el spinner inicial; main.jsx lo precarga en paralelo con la sesión.
const DiscoveryView = lazy(() => import('./features/discovery/DiscoveryView.jsx'))
const MiniPlayer = lazy(() => import('./features/mini-player/MiniPlayer.tsx'))
const NewArtistSpotlightDemo = lazy(() => import('./features/discovery/NewArtistSpotlightDemo.jsx'))
const DesktopGoogleAuth = lazy(() => import('./features/auth/DesktopGoogleAuth.jsx'))

function AppLoading() {
  return (
    <main className="session-loading" aria-label="Cargando aplicación">
      <span className="session-loading__disc" aria-hidden="true" />
    </main>
  )
}

/**
 * En la app de escritorio la ventana no tiene barra nativa: se dibuja TitleBar encima de todo,
 * también en la pantalla de carga y en el login (si no, la ventana no se podría mover ni cerrar).
 * En la web no se añade ningún contenedor.
 */
function AppFrame({ children, onLogout, user }) {
  if (!isDesktopShell()) return children
  return (
    <div className="app-frame">
      <TitleBar onLogout={onLogout} user={user} />
      <div className="app-frame__body">{children}</div>
    </div>
  )
}

function MainApp() {
  const auth = useAuth()
  const {
    catalogError,
    catalogLoadingMore,
    libraryLoading,
    libraryPagination,
    librarySongs,
    loadMoreCatalogSongs,
    refreshLibrary,
    searchLoading,
    searchPagination,
    searchQuery,
    searchSongs,
    setSearchQuery,
  } = useCatalogo()
  const library = useUserLibrary({ libraryLoading, librarySongs, user: auth.user })
  const {
    createPlaylist, deletePlaylist, favoritesError,
    likedAlbumIds, likedArtistIds, likedSongIds, playlists, playlistsError,
    reorderPlaylist, selectedSongId, selectedSongRestored, setFavorite, setSelectedSongId, setTrackInPlaylist,
    updatePlaylist,
  } = library

  // Solo la sesión bloquea la primera pintura. Catálogo, favoritos y playlists cargan en segundo
  // plano (con copia local si existe): antes todo esperaba al más lento y, al cambiar el catálogo,
  // el spinner reaparecía y desmontaba la aplicación entera.
  if (auth.isLoading) {
    return (
      <AppFrame onLogout={auth.logout} user={null}>
        <main className="session-loading" aria-label="Cargando sesion">
          <span className="session-loading__disc" aria-hidden="true" />
        </main>
      </AppFrame>
    )
  }

  if (!auth.user) {
    return (
      <AppFrame onLogout={auth.logout} user={null}>
        <AuthView
          authError={auth.error}
          clearError={auth.clearError}
          isSubmitting={auth.isSubmitting}
          onGoogleLogin={auth.loginWithGoogle}
          onLogin={auth.login}
          onRegister={auth.register}
        />
      </AppFrame>
    )
  }

  return (
    <AppFrame onLogout={auth.logout} user={auth.user}>
      {catalogError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Catálogo: {catalogError.message}
        </div>
      )}
      {favoritesError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Favoritos: {favoritesError}
        </div>
      )}
      {playlistsError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Playlists: {playlistsError}
        </div>
      )}
      <Suspense fallback={<AppLoading />}>
      <DiscoveryView
        catalogHasMore={Boolean((searchQuery.trim() ? searchPagination : libraryPagination)?.hasNext)}
        catalogLoadingMore={catalogLoadingMore || searchLoading || libraryLoading}
        createPlaylist={createPlaylist}
        likedAlbumIds={likedAlbumIds}
        likedArtistIds={likedArtistIds}
        likedSongIds={likedSongIds}
        onCatalogLoadMore={loadMoreCatalogSongs}
        onCatalogRefresh={refreshLibrary}
        onDeletePlaylist={deletePlaylist}
        onImportNav={() => {
          if (auth.user?.canImportMusic === true) window.location.hash = '#/importar'
        }}
        onLogout={auth.logout}
        onReorderPlaylist={reorderPlaylist}
        onSearchChange={setSearchQuery}
        onSetTrackInPlaylist={setTrackInPlaylist}
        onSongSelect={setSelectedSongId}
        onToggleAlbumFavorite={(albumId, liked) => setFavorite('album', albumId, liked)}
        onToggleArtistFavorite={(artistId, liked) => setFavorite('artist', artistId, liked)}
        onToggleFavorite={(songId, liked) => setFavorite('song', songId, liked)}
        onUpdatePlaylist={updatePlaylist}
        playlists={playlists}
        searchQuery={searchQuery}
        searchSongs={searchSongs}
        selectedSongId={selectedSongId}
        selectedSongRestored={selectedSongRestored}
        songs={librarySongs}
        user={auth.user}
      />
      </Suspense>
    </AppFrame>
  )
}

function App() {
  if (window.location.hash.startsWith('#/desktop-auth')) {
    return <Suspense fallback={<AppLoading />}><DesktopGoogleAuth /></Suspense>
  }
  if (window.__MYSIC_MINI_PLAYER__ || window.location.hash === '#/mini-player') {
    return <Suspense fallback={<AppLoading />}><MiniPlayer /></Suspense>
  }
  if (window.location.hash === '#/demo/nuevo-artista') {
    return <Suspense fallback={<AppLoading />}><NewArtistSpotlightDemo /></Suspense>
  }
  return <MainApp />
}

export default App
