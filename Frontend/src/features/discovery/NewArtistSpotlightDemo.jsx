import { useState } from 'react'
import afterglow from '../../assets/music/afterglow.webp'
import heroConcert from '../../assets/music/hero-concert.webp'
import lowTide from '../../assets/music/low-tide.webp'
import parallelLines from '../../assets/music/parallel-lines.webp'
import redThread from '../../assets/music/red-thread.webp'
import softStatic from '../../assets/music/soft-static.webp'
import NewArtistSpotlight from './NewArtistSpotlight.jsx'

const artist = {
  artistId: 'luna-varela',
  title: 'Luna Varela',
  artwork: afterglow,
  images: [afterglow, heroConcert],
  biography: 'Una voz íntima entre sintetizadores nocturnos, guitarras suaves y melodías que convierten cada viaje en una historia.',
}

const releases = {
  aurora: { id: 'aurora', title: 'Aurora', artwork: afterglow, releaseDate: '2026-09-12' },
  parallels: { id: 'parallels', title: 'Líneas paralelas', artwork: parallelLines, releaseDate: '2025-11-08' },
  tide: { id: 'tide', title: 'Marea baja', artwork: lowTide, releaseDate: '2024-06-21' },
}

const songs = [
  ['midnight-signal', 'Señal de medianoche', 'aurora', afterglow, 238],
  ['red-sky', 'Cielo rojo', 'aurora', redThread, 204],
  ['soft-static', 'Estática suave', 'aurora', softStatic, 221],
  ['parallel-lines', 'Líneas paralelas', 'parallels', parallelLines, 196],
  ['near-again', 'Cerca otra vez', 'parallels', heroConcert, 247],
  ['low-tide', 'Marea baja', 'tide', lowTide, 215],
].map(([id, title, releaseId, artwork, durationSeconds], index) => ({
  id,
  title,
  artist: artist.title,
  artistId: artist.artistId,
  artists: [{ id: artist.artistId, name: artist.title, image: artist.artwork, images: artist.images }],
  albumId: releaseId,
  albumTitle: releases[releaseId].title,
  albumMemberships: [releases[releaseId]],
  artwork,
  durationSeconds,
  duration: `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
  trackNumber: index + 1,
}))

function NewArtistSpotlightDemo() {
  const [open, setOpen] = useState(true)
  const [artistLiked, setArtistLiked] = useState(false)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [selectedSongId, setSelectedSongId] = useState(null)
  const [selectedSongPlaying, setSelectedSongPlaying] = useState(false)

  function selectSong(songId) {
    setSelectedSongId(songId)
    setSelectedSongPlaying(true)
  }

  function toggleSongFavorite(songId, liked) {
    setLikedSongIds((current) => {
      const next = new Set(current)
      if (liked) next.add(songId)
      else next.delete(songId)
      return next
    })
  }

  return (
    <main className="artist-spotlight-demo">
      <div className="artist-spotlight-demo__backdrop" aria-hidden="true" />
      <section className="artist-spotlight-demo__welcome">
        <span>Laboratorio visual · sin conexión</span>
        <h1>Modal de nuevo artista</h1>
        <p>Esta ruta usa datos e imágenes locales. Ninguna acción se conecta al servidor.</p>
        <button type="button" onClick={() => setOpen(true)}>Abrir presentación</button>
      </section>

      {open && (
        <NewArtistSpotlight
          artist={artist}
          artistLiked={artistLiked}
          likedSongIds={likedSongIds}
          onAddToPlaylist={() => {}}
          onAlbumSelect={() => {}}
          onArtistSelect={() => {}}
          onDismiss={() => setOpen(false)}
          onPlaybackToggle={() => setSelectedSongPlaying((playing) => !playing)}
          onPreviewStart={() => {}}
          onPreviewStop={() => {}}
          onSongSelect={selectSong}
          onToggleArtistFavorite={(_artistId, liked) => setArtistLiked(liked)}
          onToggleFavorite={toggleSongFavorite}
          preview={null}
          selectedSongId={selectedSongId}
          selectedSongPlaying={selectedSongPlaying}
          songs={songs}
        />
      )}
    </main>
  )
}

export default NewArtistSpotlightDemo
