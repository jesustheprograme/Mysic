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

function SectionRoute({
  albumItems,
  artistItems,
  likedSongIds,
  newReleaseSongs,
  onAddToPlaylist,
  onAlbumSelect,
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
  if (section === 'for-you') {
    const favoriteSongs = songs.filter((song) => likedSongIds?.has(song.id))

    return (
      <div className="route-page">
        <RouteHeading count={favoriteSongs.length} title="Favoritas" />
        <SongList
          key={searchKey}
          likedSongIds={likedSongIds}
          onAddToPlaylist={onAddToPlaylist}
          onPlaybackToggle={onPlaybackToggle}
          onPreviewStart={onPreviewStart}
          onPreviewStop={onPreviewStop}
          onSongSelect={onSongSelect}
          onToggleFavorite={onToggleFavorite}
          preview={preview}
          selectedSongId={selectedSongId}
          selectedSongPlaying={selectedSongPlaying}
          songs={favoriteSongs}
          title="Favoritas"
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
        <HomeRail items={artistItems} title="Artistas" />
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
