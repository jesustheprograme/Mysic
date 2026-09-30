import { ArrowLeft, Disc3, ListMusic, ListPlus, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'

const portraitDirections = ['left', 'down', 'right', 'up']
const PORTRAIT_DURATION = 5600

function getArtistTitleScale(title) {
  const length = Array.from(title.trim()).length
  if (length > 32) return 'xlong'
  if (length > 22) return 'long'
  if (length > 13) return 'medium'
  return 'short'
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function collectAlbums(songs) {
  const albums = new Map()

  songs.forEach((song) => {
    song.albumMemberships?.forEach((album) => {
      const current = albums.get(album.id)
      if (current) {
        current.songCount += 1
        current.songs.push(song)
        return
      }

      albums.set(album.id, { ...album, songCount: 1, songs: [song] })
    })
  })

  return [...albums.values()].sort((first, second) => {
    const firstYear = first.releaseDate ? new Date(first.releaseDate).getUTCFullYear() : 0
    const secondYear = second.releaseDate ? new Date(second.releaseDate).getUTCFullYear() : 0
    return secondYear - firstYear || first.title.localeCompare(second.title)
  })
}

function isSingleRelease(release) {
  return release.songCount === 1 || /^singles?$/i.test(release.title.trim())
}

function ReleaseCard({ onAlbumSelect, onPlay, playing, release }) {
  const year = release.releaseDate ? new Date(release.releaseDate).getUTCFullYear() : null

  return (
    <article className={`home-shelf-card artist-profile__album${playing ? ' home-shelf-card--playing' : ''}`}>
      <div className="artist-profile__album-visual">
        <button
          className="artist-profile__album-cover"
          type="button"
          aria-label={`Abrir ${release.title}`}
          onClick={() => onAlbumSelect?.(release.id)}
        >
          <span className={`home-shelf-card__visual${release.artwork ? '' : ' home-shelf-card__visual--empty'}`}>
            {release.artwork && <img src={release.artwork} alt="" loading="lazy" />}
          </span>
        </button>
        <button
          className="home-shelf-card__play artist-profile__album-play"
          type="button"
          aria-label={playing ? `Pausar ${release.title}` : `Reproducir ${release.title}`}
          aria-pressed={playing}
          onClick={onPlay}
        >
          {playing
            ? <Pause size={13} fill="currentColor" aria-hidden="true" />
            : <Play size={13} fill="currentColor" aria-hidden="true" />}
        </button>
      </div>
      <button
        className="artist-profile__album-meta-button"
        type="button"
        aria-label={`Abrir ${release.title}`}
        onClick={() => onAlbumSelect?.(release.id)}
      >
        <span className="home-shelf-card__meta">
          <strong>{release.title}</strong>
          <span>{year ? `${year} · ` : ''}{release.songCount} {release.songCount === 1 ? 'canción' : 'canciones'}</span>
        </span>
      </button>
    </article>
  )
}

function ArtistView({
  artist,
  likedArtistIds,
  likedSongIds,
  onAddToPlaylist,
  onAlbumSelect,
  onBack,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  onToggleArtistFavorite,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const artistSongs = useMemo(() => songs.filter((song) => (
    song.artistId === artist.artistId
    || song.artists?.some((songArtist) => songArtist.id === artist.artistId)
  )), [artist.artistId, songs])
  const albums = useMemo(() => collectAlbums(artistSongs), [artistSongs])
  const albumReleases = albums.filter((release) => !isSingleRelease(release))
  const singleReleases = albums.filter(isSingleRelease)
  const featuredSongs = artistSongs.slice(0, 8)
  const portraits = artist.images?.length ? artist.images : [artist.artwork].filter(Boolean)
  const [portraitIndex, setPortraitIndex] = useState(0)
  const selectedSongBelongsToArtist = artistSongs.some((song) => song.id === selectedSongId)
  const artistIsPlaying = selectedSongBelongsToArtist && selectedSongPlaying

  useEffect(() => {
    setPortraitIndex(0)
  }, [artist.artistId, portraits.length])

  useEffect(() => {
    if (portraits.length < 2) return undefined

    const timer = window.setTimeout(() => {
      setPortraitIndex((current) => (current + 1) % portraits.length)
    }, PORTRAIT_DURATION)

    return () => window.clearTimeout(timer)
  }, [portraitIndex, portraits.length])

  function playArtist() {
    if (!artistSongs.length) return
    if (selectedSongBelongsToArtist) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(artistSongs[0].id, { contextSong: artistSongs[0], contextSongs: artistSongs })
  }

  function shuffleArtist() {
    if (!artistSongs.length) return
    const shuffledSongs = [...artistSongs].sort(() => Math.random() - 0.5)
    onSongSelect(shuffledSongs[0].id, { contextSong: shuffledSongs[0], contextSongs: shuffledSongs })
  }

  function playAlbum(album) {
    const selectedSongBelongsToAlbum = album.songs.some((song) => song.id === selectedSongId)
    if (selectedSongBelongsToAlbum) {
      onPlaybackToggle?.()
      return
    }

    const firstSong = album.songs[0]
    if (firstSong) onSongSelect(firstSong.id, { contextSong: firstSong, contextSongs: album.songs })
  }

  return (
    <article className="artist-profile" aria-labelledby="artist-profile-title">
      <header className="artist-profile__hero">
        <div className="artist-profile__portraits" aria-hidden="true">
          {portraits.map((portrait, index) => (
            <img
              className={`artist-profile__portrait artist-profile__portrait--${portraitDirections[index % portraitDirections.length]}${index === portraitIndex ? ' artist-profile__portrait--active' : ''}`}
              src={portrait}
              alt=""
              loading={index < 2 ? 'eager' : 'lazy'}
              key={portrait}
            />
          ))}
        </div>
        <div className="artist-profile__shade" aria-hidden="true" />
        {onBack && (
          <button className="collection-detail__back" type="button" aria-label="Volver al apartado anterior" title="Volver" onClick={onBack}>
            <ArrowLeft size={21} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
        <div className="artist-profile__hero-copy">
          <h1
            className={`artist-profile__title artist-profile__title--${getArtistTitleScale(artist.title)}`}
            id="artist-profile-title"
          >
            {artist.title}
          </h1>
          <p>{artistSongs.length} canciones · {albums.length} lanzamientos</p>
          <div className="artist-profile__hero-actions">
            <button className="artist-profile__play" type="button" disabled={!artistSongs.length} onClick={playArtist}>
              {artistIsPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
              <span>{artistIsPlaying ? 'Pausar' : 'Reproducir'}</span>
            </button>
            <button className="artist-profile__shuffle" type="button" disabled={!artistSongs.length} onClick={shuffleArtist}>
              <Shuffle aria-hidden="true" />
              <span>Aleatorio</span>
            </button>
            <HeartToggle
              className="heart-container--artist"
              label={`Añadir ${artist.title} a artistas favoritos`}
              liked={likedArtistIds?.has(artist.artistId)}
              onToggle={(liked) => onToggleArtistFavorite?.(artist.artistId, liked)}
              removeLabel={`Quitar ${artist.title} de artistas favoritos`}
              size={20}
            />
          </div>
        </div>
        {portraits.length > 1 && (
          <div className="artist-profile__portrait-progress" aria-label={`Imagen ${portraitIndex + 1} de ${portraits.length}`}>
            {portraits.map((portrait, index) => {
              const isActive = index === portraitIndex

              return (
                <button
                  className={`artist-profile__portrait-progress-item${isActive ? ' is-active' : ''}`}
                  type="button"
                  aria-label={`Mostrar imagen ${index + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setPortraitIndex(index)}
                  key={portrait}
                >
                  <span
                    className="artist-profile__portrait-progress-fill"
                    style={{ animationDuration: `${PORTRAIT_DURATION}ms` }}
                    key={`${portraitIndex}-${index}`}
                  />
                </button>
              )
            })}
          </div>
        )}
      </header>

      <div className="artist-profile__content">
        <section className="artist-profile__section" aria-labelledby="artist-songs-title">
          <div className="artist-profile__section-heading">
            <ListMusic aria-hidden="true" />
            <div>
              <span>CATÁLOGO</span>
              <h2 id="artist-songs-title">Canciones destacadas</h2>
            </div>
          </div>
          <ol className="artist-profile__songs">
            {featuredSongs.map((song) => {
              const selected = song.id === selectedSongId
              return (
                <li className={`song-row artist-profile__song${selected ? ' song-row--active' : ''}${selected && selectedSongPlaying ? ' song-row--playing' : ''}`} key={song.id}>
                  <div className="song-row__main">
                    <button
                      className="song-row__artwork playback-hover"
                      type="button"
                      aria-label={`${selected && selectedSongPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
                      aria-pressed={selected && selectedSongPlaying}
                      onClick={() => {
                        if (selected) onPlaybackToggle?.()
                        else onSongSelect(song.id, { contextSong: song, contextSongs: artistSongs })
                      }}
                    >
                      <img src={song.artwork} alt="" loading="lazy" />
                        <PreviewIndicator status={selected && selectedSongPlaying ? 'playing' : null} />
                    </button>
                    <span className="song-row__copy"><strong>{song.title}</strong></span>
                  </div>
                  <span className="song-row__meta">
                    <span className="song-row__actions">
                      <HeartToggle
                        className="heart-container--song-row"
                        label={`Me gusta ${song.title}`}
                        liked={likedSongIds?.has(song.id)}
                        onToggle={(liked) => onToggleFavorite?.(song.id, liked)}
                        removeLabel={`Quitar ${song.title} de favoritas`}
                        size={16}
                      />
                      <button
                        className="song-row__action"
                        type="button"
                        aria-label={`Añadir ${song.title} a una playlist`}
                        title="Añadir a playlist"
                        onClick={() => onAddToPlaylist?.(song)}
                      >
                        <ListPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </span>
                    <span className="song-row__duration">{formatDuration(song.durationSeconds)}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="artist-profile__section" aria-labelledby="artist-albums-title">
          <div className="artist-profile__section-heading">
            <Disc3 aria-hidden="true" />
            <div>
              <span>DISCOGRAFÍA</span>
              <h2 id="artist-albums-title">Lanzamientos</h2>
            </div>
          </div>
          <div className="artist-profile__release-groups">
            {albumReleases.length > 0 && (
              <section className="artist-profile__release-group" aria-labelledby="artist-album-releases-title">
                <div className="artist-profile__release-heading">
                  <h3 id="artist-album-releases-title">Álbumes</h3>
                </div>
                <div className="artist-profile__albums">
                  {albumReleases.map((release) => (
                    <ReleaseCard
                      key={release.id}
                      onAlbumSelect={onAlbumSelect}
                      onPlay={() => playAlbum(release)}
                      playing={selectedSongPlaying && release.songs.some((song) => song.id === selectedSongId)}
                      release={release}
                    />
                  ))}
                </div>
              </section>
            )}

            {singleReleases.length > 0 && (
              <section className="artist-profile__release-group" aria-labelledby="artist-single-releases-title">
                <div className="artist-profile__release-heading">
                  <h3 id="artist-single-releases-title">Singles</h3>
                </div>
                <div className="artist-profile__albums">
                  {singleReleases.map((release) => (
                    <ReleaseCard
                      key={release.id}
                      onAlbumSelect={onAlbumSelect}
                      onPlay={() => playAlbum(release)}
                      playing={selectedSongPlaying && release.songs.some((song) => song.id === selectedSongId)}
                      release={release}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </article>
  )
}

export default ArtistView
