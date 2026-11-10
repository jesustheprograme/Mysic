import { useMemo } from 'react'
import { persistedCache } from '../../lib/persistedCache.js'
import { LIBRARY_CACHE_KEY } from '../youtube/libraryCache.js'
import { buildStats } from './statsModel.js'
import './artists-page.css'

/** Resumen de tu música. Usa el catálogo del servidor y, si no lo hay, la biblioteca de YouTube guardada en el equipo. */
function StatsPage({ albumItems, artistItems, likedSongIds, onArtistSelect, songs }) {
  const stats = useMemo(() => {
    const youtube = songs.length ? null : persistedCache.read(LIBRARY_CACHE_KEY)
    return buildStats({ albumItems, artistItems, likedSongIds, songs, youtube })
  }, [albumItems, artistItems, likedSongIds, songs])
  const maxCount = stats.top[0]?.songCount || 1
  const canOpen = stats.source === 'server'

  return (
    <div className="route-page artists-page stats-page">
      <header className="artists-page__head">
        <h1>Estadísticas</h1>
        <p>{stats.source === 'server' ? 'Un resumen de tu biblioteca de Mysic.' : 'Un resumen de tu biblioteca de YouTube Music.'}</p>
      </header>

      <dl className="stats-page__cards">
        {stats.cards.map((card) => (
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
                <button type="button" disabled={!canOpen} onClick={() => onArtistSelect?.(artist.id)}>
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