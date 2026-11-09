import { ArrowDownAZ, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import { useArtworkAccent } from '../adaptive-theme/useArtworkAccent.js'
import './artists-page.css'

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'liked', label: 'Favoritos' },
]

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * Tarjeta de artista: retrato a sangre y un degradado inferior con el color dominante de la foto
 * (el mismo extractor que usa el reproductor), de modo que cada tarjeta se funde con su propia imagen.
 */
function ArtistCard({ albumCount, artist, liked, onOpen, onToggleFavorite }) {
  // El color solo se calcula cuando la tarjeta está cerca de la pantalla (no para todos los artistas a la vez).
  const [near, setNear] = useState(false)
  const cardRef = useRef(null)
  useEffect(() => {
    const node = cardRef.current
    if (!node || near) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNear(true)
    }, { rootMargin: '300px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [near])
  const accent = useArtworkAccent(artist.artwork, { enabled: near })
  return (
    <li className="artist-card" ref={cardRef} style={accent ? { '--artist-tint': accent } : undefined}>
      <button className="artist-card__open" type="button" aria-label={`Abrir ${artist.title}`} onClick={() => onOpen(artist.artistId)}>
        {artist.artwork ? <img src={artist.artwork} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span className="artist-card__shade" aria-hidden="true" />
        <span className="artist-card__copy">
          <strong>{artist.title}</strong>
          <small>{plural(albumCount, 'álbum', 'álbumes')} · {artist.meta}</small>
        </span>
      </button>
      {onToggleFavorite && (
        <span className="artist-card__actions">
          <HeartToggle
            label={`Añadir ${artist.title} a artistas favoritos`}
            liked={liked}
            onToggle={(next) => onToggleFavorite(artist.artistId, next)}
            removeLabel={`Quitar ${artist.title} de artistas favoritos`}
            size={18}
          />
        </span>
      )}
    </li>
  )
}

function ArtistsPage({ albumItems, artistItems, likedArtistIds, onArtistSelect, onToggleArtistFavorite }) {
  const [filter, setFilter] = useState('all')
  const [sortAZ, setSortAZ] = useState(false)
  const [query, setQuery] = useState('')

  const albumCounts = useMemo(() => {
    const counts = new Map()
    albumItems.forEach((album) => counts.set(album.artistId, (counts.get(album.artistId) ?? 0) + 1))
    return counts
  }, [albumItems])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const list = artistItems.filter((artist) => (
      (filter === 'all' || likedArtistIds?.has(artist.artistId))
      && (!normalized || artist.title.toLocaleLowerCase().includes(normalized))
    ))
    return sortAZ ? [...list].sort((a, b) => a.title.localeCompare(b.title)) : list
  }, [artistItems, filter, likedArtistIds, query, sortAZ])

  return (
    <div className="route-page artists-page">
      <header className="artists-page__head">
        <h1>Artistas</h1>
        <p>Descubre y explora a tus artistas favoritos.</p>
      </header>

      <div className="artists-page__toolbar">
        <div className="artists-page__filters" role="group" aria-label="Filtrar artistas">
          {FILTERS.map((item) => (
            <button className={`artists-page__pill${filter === item.id ? ' is-active' : ''}`} type="button" aria-pressed={filter === item.id} key={item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
          <button className={`artists-page__pill${sortAZ ? ' is-active' : ''}`} type="button" aria-pressed={sortAZ} onClick={() => setSortAZ((current) => !current)}>
            <ArrowDownAZ size={15} strokeWidth={1.8} aria-hidden="true" /> A-Z
          </button>
        </div>
        <label className="artists-page__search">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <input type="search" placeholder="Buscar artista..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {visible.length ? (
        <ul className="artists-page__grid">
          {visible.map((artist) => (
            <ArtistCard
              albumCount={albumCounts.get(artist.artistId) ?? 0}
              artist={artist}
              key={artist.id}
              liked={Boolean(likedArtistIds?.has(artist.artistId))}
              onOpen={onArtistSelect}
              onToggleFavorite={onToggleArtistFavorite}
            />
          ))}
        </ul>
      ) : (
        <p className="collection-empty" role="status">{filter === 'liked' && !query ? 'Aún no tienes artistas favoritos.' : 'No encontramos artistas con esa búsqueda.'}</p>
      )}
    </div>
  )
}

export default ArtistsPage
