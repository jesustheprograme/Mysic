import { useMemo } from 'react'
import './artists-page.css'

const TOP_ARTISTS = 6

function formatHours(seconds) {
  if (!seconds) return '0 min'
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

/** Resumen de la biblioteca de Mysic calculado en el cliente con lo que ya está cargado. */
function StatsPage({ albumItems, artistItems, likedSongIds, onArtistSelect, songs }) {
  const stats = useMemo(() => {
    const perArtist = new Map()
    let seconds = 0
    songs.forEach((song) => {
      seconds += song.durationSeconds ?? 0
      perArtist.set(song.artistId, (perArtist.get(song.artistId) ?? 0) + 1)
    })
    const top = artistItems
      .map((artist) => ({ ...artist, songCount: perArtist.get(artist.artistId) ?? 0 }))
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, TOP_ARTISTS)
    return { seconds, top }
  }, [artistItems, songs])

  const likedCount = songs.filter((song) => likedSongIds?.has(song.id)).length
  const cards = [
    { label: 'Canciones', value: songs.length },
    { label: 'Artistas', value: artistItems.length },
    { label: 'Álbumes', value: albumItems.length },
    { label: 'Favoritas', value: likedCount },
    { label: 'Tiempo total', value: formatHours(stats.seconds) },
  ]
  const maxCount = stats.top[0]?.songCount || 1

  return (
    <div className="route-page artists-page stats-page">
      <header className="artists-page__head">
        <h1>Estadísticas</h1>
        <p>Un resumen de tu biblioteca de Mysic.</p>
      </header>

      <dl className="stats-page__cards">
        {cards.map((card) => (
          <div className="stats-page__card" key={card.label}>
            <dt>{card.label}</dt>
            <dd>{card.value}</dd>
          </div>
        ))}
      </dl>

      {stats.top.length > 0 && (
        <section className="stats-page__top" aria-labelledby="stats-top-title">
          <h2 id="stats-top-title">Artistas con más canciones</h2>
          <ol>
            {stats.top.map((artist) => (
              <li key={artist.id}>
                <button type="button" onClick={() => onArtistSelect?.(artist.artistId)}>
                  <span>{artist.title}</span>
                  <span className="stats-page__bar" aria-hidden="true"><i style={{ width: `${Math.max(6, (artist.songCount / maxCount) * 100)}%` }} /></span>
                  <small>{artist.songCount}</small>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

export default StatsPage
