import { ArrowDownAZ, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ArtistCard from './ArtistCard.jsx'
import './artists-page.css'

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'liked', label: 'Favoritos' },
]

const GRID_BATCH = 60

/** Cuadrícula que crece por tandas al acercarse al final: con cientos de artistas no se pintan todos de golpe. */
function ArtistGrid({ albumCounts, artists, likedArtistIds, onOpen, onToggleFavorite }) {
  const [limit, setLimit] = useState(GRID_BATCH)
  const sentinelRef = useRef(null)
  const hasMore = limit < artists.length

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit((current) => current + GRID_BATCH)
    }, { rootMargin: '900px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, limit])

  return (
    <>
      <ul className="artists-page__grid">
        {artists.slice(0, limit).map((artist) => (
          <ArtistCard
            albumCount={albumCounts.get(artist.artistId) ?? 0}
            artist={artist}
            key={artist.id}
            liked={Boolean(likedArtistIds?.has(artist.artistId))}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </ul>
      {hasMore && <div className="artists-page__sentinel" ref={sentinelRef} aria-hidden="true" />}
    </>
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
        <ArtistGrid
          albumCounts={albumCounts}
          artists={visible}
          key={`${filter}-${sortAZ}-${query}`}
          likedArtistIds={likedArtistIds}
          onOpen={onArtistSelect}
          onToggleFavorite={onToggleArtistFavorite}
        />
      ) : (
        <p className="collection-empty" role="status">{filter === 'liked' && !query ? 'Aún no tienes artistas favoritos.' : 'No encontramos artistas con esa búsqueda.'}</p>
      )}
    </div>
  )
}

export default ArtistsPage
