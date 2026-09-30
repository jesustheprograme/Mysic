import { ArrowRight, Pause, Play, Shuffle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import HeartToggle from '../../components/HeartToggle.jsx'
import HomeRail from './HomeRail.jsx'
import SongList from './SongList.jsx'

function collectAlbums(songs) {
  const albums = new Map()

  songs.forEach((song) => {
    const memberships = song.albumMemberships?.length
      ? song.albumMemberships
      : [{ id: song.albumId, title: song.albumTitle, artwork: song.artwork, releaseDate: song.releaseDate }]

    memberships.forEach((album) => {
      if (!album.id) return

      const current = albums.get(album.id)
      if (current) {
        current.songCount += 1
        return
      }

      albums.set(album.id, { ...album, songCount: 1 })
    })
  })

  return [...albums.values()].sort((first, second) => {
    const firstTime = first.releaseDate ? new Date(first.releaseDate).getTime() : 0
    const secondTime = second.releaseDate ? new Date(second.releaseDate).getTime() : 0
    return secondTime - firstTime || first.title.localeCompare(second.title)
  })
}

function NewArtistSpotlight({
  artist,
  artistLiked,
  likedSongIds,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onDismiss,
  onPlaybackToggle,
  onPreviewStart,
  onPreviewStop,
  onSongSelect,
  onToggleFavorite,
  onToggleArtistFavorite,
  preview,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const dialogRef = useRef(null)
  const artistSongs = songs.filter((song) => (
    (artist?.artistId && song.artistId === artist.artistId)
    || song.artists?.some((songArtist) => songArtist.id === artist?.artistId)
  ))
  const featuredSongs = artistSongs.slice(0, 10)
  const albums = collectAlbums(artistSongs)
  const profileImage = artist?.artwork ?? featuredSongs[0]?.artwork
  const bannerImage = artist?.images?.find((image) => image !== profileImage) ?? albums[0]?.artwork ?? profileImage
  const artistName = artist?.title ?? artist?.name ?? 'este artista'
  const selectedSongBelongsToArtist = artistSongs.some((song) => song.id === selectedSongId)
  const artistIsPlaying = selectedSongBelongsToArtist && selectedSongPlaying
  const description = artist?.biography
    || `${artistName} llega a MYSIC. Descubre una selección de sus canciones y álbumes disponibles en el catálogo.`

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onDismiss?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onDismiss])

  function playSong(song) {
    onSongSelect?.(song.id, { contextSong: song, contextSongs: artistSongs })
  }

  function playArtist() {
    if (!featuredSongs.length) return
    if (selectedSongBelongsToArtist) {
      onPlaybackToggle?.()
      return
    }
    playSong(featuredSongs[0])
  }

  function shuffleArtist() {
    if (!artistSongs.length) return
    const randomSong = artistSongs[Math.floor(Math.random() * artistSongs.length)]
    playSong(randomSong)
  }

  function viewArtist() {
    onDismiss?.()
    onArtistSelect?.(artist?.artistId)
  }

  const albumItems = albums.map((album) => {
    const releaseYear = album.releaseDate ? new Date(album.releaseDate).getUTCFullYear() : null
    return {
      ...album,
      artist: [releaseYear, `${album.songCount} ${album.songCount === 1 ? 'canción' : 'canciones'}`]
        .filter(Boolean)
        .join(' · '),
    }
  })

  return createPortal(
    <div className="artist-intro artist-intro--spotlight" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onDismiss?.()
    }}>
      <section
        className="artist-intro__dialog artist-spotlight-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="artist-intro-title"
        aria-describedby="artist-intro-description"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button className="artist-intro__close" type="button" aria-label="Cerrar presentación" onClick={onDismiss}>
          <X size={20} aria-hidden="true" />
        </button>

        <div className="artist-spotlight-card__top">
          <div className="artist-spotlight-card__avatar">
            {profileImage && <img src={profileImage} alt={`Perfil de ${artistName}`} />}
          </div>
          <div className="artist-spotlight-card__banner">
            {bannerImage && <img src={bannerImage} alt="" />}
            {featuredSongs[0] && (
              <button
                className="artist-spotlight-card__banner-play"
                type="button"
                aria-label={`Reproducir ${featuredSongs[0].title}`}
                onClick={() => playSong(featuredSongs[0])}
              >
                <Play size={25} fill="currentColor" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <section className="artist-spotlight-card__intro">
          <div className="artist-spotlight-card__copy">
            <div className="artist-spotlight-card__meta">
              <span>{artistSongs.length} canciones</span>
              <i aria-hidden="true">•</i>
              <span>{albums.length} lanzamientos</span>
            </div>
            <div className="artist-spotlight-card__title-row">
              <h2 id="artist-intro-title">{artistName}</h2>
              <span className="home-shelf-card__badge artist-spotlight-card__badge">NUEVO</span>
            </div>
            <p id="artist-intro-description">{description}</p>
          </div>

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
              label={`Añadir ${artistName} a artistas favoritos`}
              liked={artistLiked}
              onToggle={(liked) => onToggleArtistFavorite?.(artist?.artistId, liked)}
              removeLabel={`Quitar ${artistName} de artistas favoritos`}
              size={20}
            />
          </div>
        </section>

        <div className="artist-intro__catalog artist-spotlight-card__catalog">
          <SongList
            headingAction={(
              <button className="artist-spotlight-card__heading-action" type="button" onClick={viewArtist}>
                Ver todo
              </button>
            )}
            likedSongIds={likedSongIds}
            onAddToPlaylist={onAddToPlaylist}
            onAlbumSelect={onAlbumSelect}
            onPlaybackToggle={onPlaybackToggle}
            onPreviewStart={onPreviewStart}
            onPreviewStop={onPreviewStop}
            onSongSelect={(songId) => {
              const song = featuredSongs.find((item) => item.id === songId)
              if (song) playSong(song)
            }}
            onToggleFavorite={onToggleFavorite}
            preview={preview}
            selectedSongId={selectedSongId}
            selectedSongPlaying={selectedSongPlaying}
            showNumbers
            songs={featuredSongs}
            trailingContent={(
              <button className="artist-intro__scroll-action artist-intro__scroll-action--song" type="button" onClick={viewArtist}>
                Ver a {artistName} <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
            title="Canciones populares"
          />

          <div className="artist-spotlight-card__releases">
            <HomeRail
              headingAction={(
                <button className="artist-spotlight-card__heading-action" type="button" onClick={viewArtist}>
                  Ver todo
                </button>
              )}
              items={albumItems}
              onSelect={(albumId) => {
                onDismiss?.()
                onAlbumSelect?.(albumId)
              }}
              title="Álbumes"
              trailingContent={albums.length > 2 ? (
                <button className="artist-intro__scroll-action artist-intro__scroll-action--album" type="button" onClick={viewArtist}>
                  Ver a {artistName} <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : null}
            />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default NewArtistSpotlight
