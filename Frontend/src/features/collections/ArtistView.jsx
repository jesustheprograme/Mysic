import { ArrowLeft, Disc3, ListMusic, ListPlus, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'

const portraitDirections = ['left', 'down', 'right', 'up']
const PORTRAIT_DURATION = 5600
const RELEASE_PREVIEW_LIMIT = 6
const EXPANDED_RELEASE_GROUPS = { albums: true, eps: true, singles: true }

function getArtistTitleScale(title) {
  const length = Array.from(title.trim()).length
  if (length < 6) return 'very-short'
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

function ReleaseCard({ onAlbumSelect, onPlay, playing, release }) {
  const year = release.releaseDate ? new Date(release.releaseDate).getUTCFullYear() : null
  const releaseMeta = release.songCount == null
    ? [release.subtitle, year].filter(Boolean).join(' · ')
    : `${year ? `${year} · ` : ''}${release.songCount} ${release.songCount === 1 ? 'canción' : 'canciones'}`

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
          {releaseMeta && <span>{releaseMeta}</span>}
        </span>
      </button>
    </article>
  )
}

function ReleaseGroup({
  expanded,
  headingId,
  onAlbumSelect,
  onPlay,
  onToggleExpanded,
  releases,
  selectedSongId,
  selectedSongPlaying,
  title,
}) {
  const visibleReleases = expanded ? releases : releases.slice(0, RELEASE_PREVIEW_LIMIT)
  const hasMore = releases.length > RELEASE_PREVIEW_LIMIT

  return (
    <section className="artist-profile__release-group" aria-labelledby={headingId}>
      <div className="artist-profile__release-heading">
        <h3 id={headingId}>{title}</h3>
        {hasMore && (
          <button
            className="artist-profile__release-toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls={`${headingId}-grid`}
            onClick={onToggleExpanded}
          >
            {expanded ? 'Ver menos' : 'Ver todo'}
          </button>
        )}
      </div>
      <div className="artist-profile__albums" id={`${headingId}-grid`}>
        {visibleReleases.map((release) => (
          <ReleaseCard
            key={release.id}
            onAlbumSelect={onAlbumSelect}
            onPlay={() => onPlay(release)}
            playing={selectedSongPlaying && release.songs?.some((song) => song.id === selectedSongId)}
            release={release}
          />
        ))}
      </div>
    </section>
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
  onReleasePlay,
  onSongSelect,
  onToggleFavorite,
  onToggleArtistFavorite,
  renderSongActions,
  selectedSongId,
  selectedSongPlaying,
  songs,
  releases,
}) {
  const artistSongs = useMemo(() => songs.filter((song) => (
    song.artistId === artist.artistId
    || song.artists?.some((songArtist) => songArtist.id === artist.artistId)
  )), [artist.artistId, songs])
  const albums = useMemo(() => releases ?? collectAlbums(artistSongs), [artistSongs, releases])
  const albumReleases = albums.filter((release) => (
    release.releaseType === 'album' || (!release.releaseType && release.songCount !== 1)
  ))
  const epReleases = albums.filter((release) => release.releaseType === 'ep')
  const singleReleases = albums.filter((release) => (
    release.releaseType === 'single' || (!release.releaseType && release.songCount === 1)
  ))
  const featuredSongs = artistSongs.slice(0, 8)
  const portraits = artist.images?.length ? artist.images : [artist.artwork].filter(Boolean)
  const [portraitIndex, setPortraitIndex] = useState(0)
  const [releaseExpansion, setReleaseExpansion] = useState({
    artistId: artist.artistId,
    groups: EXPANDED_RELEASE_GROUPS,
  })
  const expandedReleaseGroups = releaseExpansion.artistId === artist.artistId
    ? releaseExpansion.groups
    : EXPANDED_RELEASE_GROUPS
  const activePortraitIndex = portraits.length ? portraitIndex % portraits.length : 0
  const selectedSongBelongsToArtist = artistSongs.some((song) => song.id === selectedSongId)
  const artistIsPlaying = selectedSongBelongsToArtist && selectedSongPlaying

  useEffect(() => {
    if (portraits.length < 2) return undefined

    const timer = window.setTimeout(() => {
      setPortraitIndex((current) => (current + 1) % portraits.length)
    }, PORTRAIT_DURATION)

    return () => window.clearTimeout(timer)
  }, [portraitIndex, portraits.length])

  function toggleReleaseGroup(group) {
    setReleaseExpansion((current) => {
      const groups = current.artistId === artist.artistId ? current.groups : EXPANDED_RELEASE_GROUPS
      return {
        artistId: artist.artistId,
        groups: { ...groups, [group]: !groups[group] },
      }
    })
  }

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
    if (onReleasePlay) {
      onReleasePlay(album)
      return
    }

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
              className={`artist-profile__portrait artist-profile__portrait--${portraitDirections[index % portraitDirections.length]}${index === activePortraitIndex ? ' artist-profile__portrait--active' : ''}`}
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
          {portraits[activePortraitIndex] && (
            <img
              className="artist-profile__mobile-portrait"
              src={portraits[activePortraitIndex]}
              alt=""
              aria-hidden="true"
            />
          )}
          <h1
            className={`artist-profile__title artist-profile__title--${getArtistTitleScale(artist.title)}`}
            id="artist-profile-title"
          >
            {artist.title}
          </h1>
          <p>{albumReleases.length} {albumReleases.length === 1 ? 'álbum' : 'álbumes'} · {epReleases.length} {epReleases.length === 1 ? 'EP' : 'EPs'}</p>
          <div className="artist-profile__hero-actions">
            <button className="artist-profile__play" type="button" disabled={!artistSongs.length} onClick={playArtist}>
              {artistIsPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
              <span>{artistIsPlaying ? 'Pausar' : 'Reproducir'}</span>
            </button>
            <button className="artist-profile__shuffle" type="button" disabled={!artistSongs.length} onClick={shuffleArtist}>
              <Shuffle aria-hidden="true" />
              <span>Aleatorio</span>
            </button>
            {onToggleArtistFavorite && (
              <HeartToggle
                className="heart-container--artist"
                label={`Añadir ${artist.title} a artistas favoritos`}
                liked={likedArtistIds?.has(artist.artistId)}
                onToggle={(liked) => onToggleArtistFavorite(artist.artistId, liked)}
                removeLabel={`Quitar ${artist.title} de artistas favoritos`}
                size={20}
              />
            )}
          </div>
        </div>
        {portraits.length > 1 && (
          <div className="artist-profile__portrait-progress" aria-label={`Imagen ${activePortraitIndex + 1} de ${portraits.length}`}>
            {portraits.map((portrait, index) => {
              const isActive = index === activePortraitIndex

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
                    key={`${activePortraitIndex}-${index}`}
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
            <h2 id="artist-songs-title">Canciones más escuchadas</h2>
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
                    <span className="song-row__copy">
                      <strong>{song.title}</strong>
                      {song.album && (
                        <button
                          className="song-row__catalog-link song-row__catalog-link--album"
                          type="button"
                          disabled={!song.albumId || !onAlbumSelect}
                          onClick={() => onAlbumSelect?.(song.albumId)}
                        >
                          {song.album}
                        </button>
                      )}
                    </span>
                  </div>
                  <span className="song-row__meta">
                    <span className="song-row__actions">
                      {onToggleFavorite && (
                        <HeartToggle
                          className="heart-container--song-row"
                          label={`Me gusta ${song.title}`}
                          liked={likedSongIds?.has(song.id)}
                          onToggle={(liked) => onToggleFavorite(song.id, liked)}
                          removeLabel={`Quitar ${song.title} de favoritas`}
                          size={16}
                        />
                      )}
                      {onAddToPlaylist && (
                        <button
                          className="song-row__action"
                          type="button"
                          aria-label={`Añadir ${song.title} a una playlist`}
                          title="Añadir a playlist"
                          onClick={() => onAddToPlaylist(song)}
                        >
                          <ListPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      )}
                      {renderSongActions?.(song)}
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
            <h2 id="artist-albums-title">Discografía</h2>
          </div>
          <div className="artist-profile__release-groups">
            {albumReleases.length > 0 && (
              <ReleaseGroup
                expanded={Boolean(expandedReleaseGroups.albums)}
                headingId="artist-album-releases-title"
                onAlbumSelect={onAlbumSelect}
                onPlay={playAlbum}
                onToggleExpanded={() => toggleReleaseGroup('albums')}
                releases={albumReleases}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                title="Álbumes"
              />
            )}

            {epReleases.length > 0 && (
              <ReleaseGroup
                expanded={Boolean(expandedReleaseGroups.eps)}
                headingId="artist-ep-releases-title"
                onAlbumSelect={onAlbumSelect}
                onPlay={playAlbum}
                onToggleExpanded={() => toggleReleaseGroup('eps')}
                releases={epReleases}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                title="EPs"
              />
            )}

            {singleReleases.length > 0 && (
              <ReleaseGroup
                expanded={Boolean(expandedReleaseGroups.singles)}
                headingId="artist-single-releases-title"
                onAlbumSelect={onAlbumSelect}
                onPlay={playAlbum}
                onToggleExpanded={() => toggleReleaseGroup('singles')}
                releases={singleReleases}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                title="Singles"
              />
            )}
          </div>
        </section>
      </div>
    </article>
  )
}

export default ArtistView
