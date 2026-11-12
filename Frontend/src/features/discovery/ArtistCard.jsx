import { useEffect, useRef, useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import { useArtworkAccent } from '../adaptive-theme/useArtworkAccent.js'
import './artists-page.css'

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * Tarjeta de artista: retrato a sangre y un degradado inferior con el color dominante de la foto
 * (el mismo extractor que usa el reproductor), de modo que cada tarjeta se funde con su propia imagen.
 * La usan la página Artistas y la pestaña Artistas de la Biblioteca de YouTube.
 *
 * `artist`: { artistId, artwork, title, meta }. `albumCount` es opcional: sin él solo se muestra `meta`.
 */
export default function ArtistCard({ albumCount, artist, liked = false, onOpen, onToggleFavorite }) {
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
  const detail = albumCount == null ? artist.meta : `${plural(albumCount, 'álbum', 'álbumes')} · ${artist.meta}`
  return (
    <li className="artist-card" ref={cardRef} style={accent ? { '--artist-tint': accent } : undefined}>
      <button className="artist-card__open" type="button" aria-label={`Abrir ${artist.title}`} onClick={() => onOpen(artist.artistId)}>
        {artist.artwork ? <img src={artist.artwork} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span className="artist-card__shade" aria-hidden="true" />
        <span className="artist-card__copy">
          <strong>{artist.title}</strong>
          {detail ? <small>{detail}</small> : null}
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
