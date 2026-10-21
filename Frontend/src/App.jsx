import { lazy, Suspense } from 'react'
import useCatalogo from './estado/catalogo/useCatalogo.js'
import useUserLibrary from './estado/useUserLibrary.js'
import AuthView from './features/auth/AuthView.jsx'
import useAuth from './features/auth/useAuth.js'
import DiscoveryView from './features/discovery/DiscoveryView.jsx'
import './styles/app.css'
import './styles/home.css'

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
    addSongToPlaylist, createPlaylist, deletePlaylist, favoritesError, favoritesLoading,
    likedAlbumIds, likedArtistIds, likedSongIds, playlists, playlistsError, playlistsLoading,
    reorderPlaylist, selectedSongId, setExternalSongInPlaylist, setFavorite, setSelectedSongId,
    setSongInPlaylist, updatePlaylist,
  } = library

  if (auth.isLoading || libraryLoading || (auth.user && (favoritesLoading || playlistsLoading))) {
    return (
      <main className="session-loading" aria-label="Cargando sesion">
        <span className="session-loading__disc" aria-hidden="true" />
      </main>
    )
  }

  if (!auth.user) {
    return (
      <AuthView
        authError={auth.error}
        clearError={auth.clearError}
        isSubmitting={auth.isSubmitting}
        onGoogleLogin={auth.loginWithGoogle}
        onLogin={auth.login}
        onRegister={auth.register}
      />
    )
  }

  return (
    <>
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
      <DiscoveryView
        addSongToPlaylist={addSongToPlaylist}
        catalogHasMore={Boolean((searchQuery.trim() ? searchPagination : libraryPagination)?.hasNext)}
        catalogLoadingMore={catalogLoadingMore || searchLoading}
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
        onSetSongInPlaylist={setSongInPlaylist}
        onSetExternalSongInPlaylist={setExternalSongInPlaylist}
        onSongSelect={setSelectedSongId}
        onToggleAlbumFavorite={(albumId, liked) => setFavorite('album', albumId, liked)}
        onToggleArtistFavorite={(artistId, liked) => setFavorite('artist', artistId, liked)}
        onToggleFavorite={(songId, liked) => setFavorite('song', songId, liked)}
        onUpdatePlaylist={updatePlaylist}
        playlists={playlists}
        searchQuery={searchQuery}
        searchSongs={searchSongs}
        selectedSongId={selectedSongId}
        songs={librarySongs}
        user={auth.user}
      />
    </>
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
