import { Search } from 'lucide-react'
import { useState } from 'react'
import HomeRail from './HomeRail.jsx'
import SongList from './SongList.jsx'

function RouteHeading({ count, title }) {
  return (
    <div className="collection-heading">
      <h1>{title}</h1>
      <span>{String(count).padStart(2, '0')}</span>
    </div>
  )
}

function FavoriteSearch({ label, onChange, value }) {
  return (
    <label className="favorites-search">
      <Search size={17} strokeWidth={1.8} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SectionRoute({
  albumItems,
  artistItems,
  likedAlbumIds,
  likedArtistIds,
  likedSongIds,
  newReleaseSongs,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onPlaybackToggle,
  onPreviewStart,
  onPreviewStop,
  onSongSelect,
  onToggleFavorite,
  preview,
  recentSongs,
  searchKey,
  section,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const [songQuery, setSongQuery] = useState('')
  const [albumQuery, setAlbumQuery] = useState('')
  const [artistQuery, setArtistQuery] = useState('')

  if (section === 'for-you') {
    const normalizedSongQuery = songQuery.trim().toLocaleLowerCase()
    const normalizedAlbumQuery = albumQuery.trim().toLocaleLowerCase()
    const normalizedArtistQuery = artistQuery.trim().toLocaleLowerCase()
    const matchesQuery = (query, ...values) => !query || values.some((value) => (
      String(value ?? '').toLocaleLowerCase().includes(query)
    ))
    const favoriteSongs = songs.filter((song) => (
      likedSongIds?.has(song.id)
      && matchesQuery(normalizedSongQuery, song.title, song.artist, song.albumTitle)
    ))
    const favoriteAlbums = albumItems.filter((album) => (
      likedAlbumIds?.has(album.albumId)
      && matchesQuery(normalizedAlbumQuery, album.title, album.artist)
    ))
    const favoriteArtists = artistItems.filter((artist) => (
      likedArtistIds?.has(artist.artistId)
      && matchesQuery(normalizedArtistQuery, artist.title)
    ))

    return (
      <div className="route-page favorites-page">
        <SongList
          emptyMessage={normalizedSongQuery ? 'No encontramos canciones favoritas con esa búsqueda.' : 'No tienes canciones favoritas todavía.'}
          headingAction={(
            <FavoriteSearch label="Buscar canciones" value={songQuery} onChange={setSongQuery} />
          )}
          key={searchKey}
          likedSongIds={likedSongIds}
          onAddToPlaylist={onAddToPlaylist}
          onAlbumSelect={(albumId) => onAlbumSelect?.(`album-${albumId}`)}
          onArtistSelect={onArtistSelect}
          onPlaybackToggle={onPlaybackToggle}
          onPreviewStart={onPreviewStart}
          onPreviewStop={onPreviewStop}
          onSongSelect={onSongSelect}
          onToggleFavorite={onToggleFavorite}
          preview={preview}
          selectedSongId={selectedSongId}
          selectedSongPlaying={selectedSongPlaying}
          songs={favoriteSongs}
          title="Canciones favoritas"
        />
        <HomeRail
          emptyMessage={normalizedAlbumQuery ? 'No encontramos álbumes favoritos con esa búsqueda.' : 'No tienes álbumes favoritos todavía.'}
          headingAction={(
            <FavoriteSearch label="Buscar álbumes" value={albumQuery} onChange={setAlbumQuery} />
          )}
          items={favoriteAlbums}
          onSelect={onAlbumSelect}
          title="Álbumes favoritos"
        />
        <HomeRail
          emptyMessage={normalizedArtistQuery ? 'No encontramos artistas favoritos con esa búsqueda.' : 'No tienes artistas favoritos todavía.'}
          headingAction={(
            <FavoriteSearch label="Buscar artistas" value={artistQuery} onChange={setArtistQuery} />
          )}
          items={favoriteArtists}
          onSelect={(itemId) => onArtistSelect?.(itemId.replace(/^artist-/, ''))}
          title="Artistas favoritos"
          variant="artist"
        />
      </div>
    )
  }

  if (section === 'recent') {
    return (
      <div className="route-page">
        <RouteHeading count={recentSongs.length} title="Historial" />
        <HomeRail
          items={recentSongs}
          onPlaybackToggle={onPlaybackToggle}
          onPreviewStart={onPreviewStart}
          onPreviewStop={onPreviewStop}
          onSelect={onSongSelect}
          preview={preview}
          selectedId={selectedSongId}
          selectedItemPlaying={selectedSongPlaying}
          title="Escuchado recientemente"
        />
      </div>
    )
  }

  if (section === 'albums') {
    return (
      <div className="route-page">
        <RouteHeading count={albumItems.length} title="Albumes" />
        <HomeRail items={albumItems} onPreviewStart={onPreviewStart} onPreviewStop={onPreviewStop} onSelect={onAlbumSelect} preview={preview} title="Albumes" />
      </div>
    )
  }

  if (section === 'artists') {
    return (
      <div className="route-page">
        <RouteHeading count={artistItems.length} title="Artistas" />
        <HomeRail items={artistItems} onSelect={(itemId) => onArtistSelect?.(itemId.replace(/^artist-/, ''))} title="Artistas" variant="artist" />
      </div>
    )
  }

  if (section === 'explore') {
    return (
      <div className="route-page">
        <RouteHeading count={songs.length} title="Explorar" />
        <HomeRail
          items={newReleaseSongs}
          onPlaybackToggle={onPlaybackToggle}
          onPreviewStart={onPreviewStart}
          onPreviewStop={onPreviewStop}
          onSelect={onSongSelect}
          preview={preview}
          selectedId={selectedSongId}
          selectedItemPlaying={selectedSongPlaying}
          title="Nuevos lanzamientos"
        />
        <HomeRail
          items={recentSongs}
          onPlaybackToggle={onPlaybackToggle}
          onPreviewStart={onPreviewStart}
          onPreviewStop={onPreviewStop}
          onSelect={onSongSelect}
          preview={preview}
          selectedId={selectedSongId}
          selectedItemPlaying={selectedSongPlaying}
          title="Recomendado para ti"
        />
      </div>
    )
  }

  return null
}

export default SectionRoute
