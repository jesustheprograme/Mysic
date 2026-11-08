import { ArrowLeft, ListPlus, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import { SectionIcon, ShelfHeading } from '../youtube/ShelfLayouts.jsx'

const portraitDirections = ['left', 'down', 'right', 'up']
const PORTRAIT_DURATION = 5600
const SONGS_PER_COLUMN = 4
const FEATURED_SONGS = SONGS_PER_COLUMN * 3

function getArtistTitleScale(title) {
  const length = Array.from(title.trim()).length
  if (length < 6) return 'very-short'
  if (length > 32) return 'xlong'
  if (length > 22) return 'long'
  if (length > 13) return 'medium'
  return 'short'
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

// Un lanzamiento como tarjeta de HomeRail (la misma que usa el inicio): portada, título y "año · canciones".
function toRailItem(release) {
  const year = release.releaseDate ? new Date(release.releaseDate).getUTCFullYear() : null
  const meta = release.songCount == null
    ? [release.subtitle, year].filter(Boolean).join(' · ')
    : `${year ? `${year} · ` : ''}${release.songCount} ${release.songCount === 1 ? 'canción' : 'canciones'}`
  return { id: release.id, title: release.title, artwork: release.artwork, meta }
}

// Fila de canción con el mismo aspecto que las del inicio (.sl-song): miniatura, título y álbum;
// el corazón solo aparece al pasar el cursor (o si ya es favorita).
function ArtistSongRow({ likedSongIds, onAddToPlaylist, onPlay, onToggleFavorite, renderSongActions, selected, song }) {
  const liked = Boolean(likedSongIds?.has(song.id))
  const albumTitle = song.albumTitle ?? song.album?.title ?? song.albumMemberships?.[0]?.title
  return (
    <li className={`sl-song${selected ? ' sl-song--active' : ''}${liked ? ' sl-song--liked' : ''}`}>
      <button className="sl-song__main" type="button" onClick={onPlay}>
        {song.artwork ? <img src={song.artwork} alt="" width="44" height="44" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span className="sl-song__text">
          <strong>{song.title}</strong>
          {albumTitle && <small>{albumTitle}</small>}
        </span>
      </button>
      <span className="sl-song__actions">
        <HeartToggle className="heart-container--song-row" label={`Me gusta ${song.title}`} liked={liked} onToggle={(next) => onToggleFavorite?.(song.id, next, song)} removeLabel={`Quitar ${song.title} de favoritas`} size={16} />
        {onAddToPlaylist && <button className="sl-song__more" type="button" aria-label={`Añadir ${song.title} a una playlist`} title="Añadir a playlist" onClick={() => onAddToPlaylist(song)}><ListPlus size={16} strokeWidth={1.8} aria-hidden="true" /></button>}
        {renderSongActions?.(song)}
      </span>
    </li>
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
  onViewAllSongs,
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
  const albumItems = useMemo(() => albums.filter((release) => (
    release.releaseType === 'album' || (!release.releaseType && release.songCount !== 1)
  )).map(toRailItem), [albums])
  const epItems = useMemo(() => albums.filter((release) => release.releaseType === 'ep').map(toRailItem), [albums])
  const singleItems = useMemo(() => albums.filter((release) => (
    release.releaseType === 'single' || (!release.releaseType && release.songCount === 1)
  )).map(toRailItem), [albums])
  const featuredSongs = artistSongs.slice(0, FEATURED_SONGS)
  const songRows = Math.min(SONGS_PER_COLUMN, Math.max(1, Math.ceil(featuredSongs.length / 3)))
  const portraits = artist.images?.length ? artist.images : [artist.artwork].filter(Boolean)
  const [portraitIndex, setPortraitIndex] = useState(0)
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

  function playSong(song) {
    if (song.id === selectedSongId) onPlaybackToggle?.()
    else onSongSelect(song.id, { contextSong: song, contextSongs: artistSongs })
  }

  const releaseGroups = [
    { items: albumItems, title: 'Álbumes' },
    { items: epItems, title: 'EPs' },
    { items: singleItems, title: 'Singles' },
  ].filter((group) => group.items.length > 0)

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
          <p>{albumItems.length} {albumItems.length === 1 ? 'álbum' : 'álbumes'} · {epItems.length} {epItems.length === 1 ? 'EP' : 'EPs'}</p>
          <div className="artist-profile__hero-actions">
            <button className="artist-profile__play" type="button" disabled={!artistSongs.length} onClick={playArtist}>
              {artistIsPlaying ? <Pause fill="currentColor" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
              <span>{artistIsPlaying ? 'Pausar' : 'Reproducir'}</span>
            </button>
            <button className="artist-profile__shuffle" type="button" disabled={!artistSongs.length} aria-label="Reproducción aleatoria" title="Aleatorio" onClick={shuffleArtist}>
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

      <div className="artist-profile__content home-page">
        {featuredSongs.length > 0 && (
          <section className="sl-shelf" aria-labelledby="artist-songs-title">
            <ShelfHeading
              action={onViewAllSongs ? <button className="sl-see-all" type="button" onClick={onViewAllSongs}>Ver todas las canciones</button> : undefined}
              id="artist-songs-title"
              kind="songs"
              title="Canciones más escuchadas"
            />
            <ol className="sl-songs" style={{ '--sl-rows': songRows }}>
              {featuredSongs.map((song) => (
                <ArtistSongRow
                  key={song.id}
                  likedSongIds={likedSongIds}
                  onAddToPlaylist={onAddToPlaylist}
                  onPlay={() => playSong(song)}
                  onToggleFavorite={onToggleFavorite}
                  renderSongActions={renderSongActions}
                  selected={song.id === selectedSongId}
                  song={song}
                />
              ))}
            </ol>
          </section>
        )}

        {releaseGroups.map((group) => (
          <HomeRail
            fitColumns
            icon={<SectionIcon kind="rail" />}
            items={group.items}
            key={group.title}
            onSelect={onAlbumSelect}
            title={group.title}
          />
        ))}
      </div>
    </article>
  )
}

export default ArtistView
