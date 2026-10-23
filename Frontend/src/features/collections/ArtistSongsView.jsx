import { ArrowLeft, Pause, Play } from 'lucide-react'
import { useMemo } from 'react'

function groupSongsByAlbum(songs) {
  const groups = new Map()
  songs.forEach((song) => {
    const key = song.albumId || `unreleased:${song.album || 'Sin álbum'}`
    if (!groups.has(key)) {
      groups.set(key, {
        artwork: song.artwork,
        id: song.albumId,
        songs: [],
        title: song.album || 'Sin álbum',
      })
    }
    groups.get(key).songs.push(song)
  })
  return [...groups.values()]
}

function ArtistSongsView({
  artistName,
  onAlbumSelect,
  onBack,
  onPlaybackToggle,
  onSongSelect,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const albums = useMemo(() => groupSongsByAlbum(songs), [songs])

  function selectSong(song) {
    if (song.id === selectedSongId) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(song.id)
  }

  return (
    <article className="artist-songs-page" aria-labelledby="artist-songs-page-title">
      <header className="artist-songs-page__header">
        <button className="collection-detail__back" type="button" aria-label="Volver al artista" title="Volver" onClick={onBack}>
          <ArrowLeft size={21} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <div>
          <span>{artistName}</span>
          <h1 id="artist-songs-page-title">Todas las canciones</h1>
          <p>{songs.length} canciones en {albums.length} lanzamientos</p>
        </div>
      </header>

      <div className="artist-songs-page__grid">
        {albums.map((album, index) => {
          const headingId = `artist-songs-album-${index}`
          return (
          <section className="artist-songs-album" aria-labelledby={headingId} key={album.id || album.title}>
            <div className="artist-songs-album__header">
              <img src={album.artwork} alt="" loading="lazy" />
              <button
                id={headingId}
                type="button"
                disabled={!album.id}
                onClick={() => album.id && onAlbumSelect(album.id)}
              >
                {album.title}
              </button>
            </div>
            <ol>
              {album.songs.map((song) => {
                const selected = song.id === selectedSongId
                const playing = selected && selectedSongPlaying
                return (
                  <li className={selected ? 'is-active' : ''} key={song.id}>
                    <button type="button" aria-label={`${playing ? 'Pausar' : 'Reproducir'} ${song.title}`} onClick={() => selectSong(song)}>
                      {playing ? <Pause size={12} fill="currentColor" aria-hidden="true" /> : <Play size={12} fill="currentColor" aria-hidden="true" />}
                      <span>{song.title}</span>
                    </button>
                    <small>{song.duration}</small>
                  </li>
                )
              })}
            </ol>
          </section>
          )
        })}
      </div>
    </article>
  )
}

export default ArtistSongsView
