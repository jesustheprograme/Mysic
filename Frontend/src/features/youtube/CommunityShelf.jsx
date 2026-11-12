import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sizedImage } from '../../lib/imageSize.js'
import { usePlaylistPreview } from './playlistPreview.js'
import { ShelfHeading } from './ShelfLayouts.jsx'
import './community-shelf.css'

const SONGS_PER_CARD = 3
// Ancho de la columna de la portada (.cs-card): la imagen se pide a ese tamaño.
const COVER_PX = 132

/** true cuando el elemento entra (o está cerca de entrar) en pantalla; una vez visible no vuelve a false. */
function useSeen() {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || seen) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen])
  return [ref, seen]
}

function SongRows({ currentSongId, onPlaySong, preview }) {
  const songs = preview.data?.songs ?? []
  if (preview.loading) {
    return Array.from({ length: SONGS_PER_CARD }, (_, index) => (
      <li className="cs-song cs-song--skeleton" key={index} aria-hidden="true"><i /><span><b /><b /></span></li>
    ))
  }
  if (!songs.length) return <li className="cs-empty">No se pudieron cargar las canciones.</li>
  return songs.slice(0, SONGS_PER_CARD).map((song) => (
    <li key={song.id}>
      <button className={`cs-song${song.id === currentSongId ? ' cs-song--active' : ''}`} type="button" onClick={() => onPlaySong(songs, song.id)}>
        {song.thumbnail ? <img src={sizedImage(song.thumbnail, 40)} alt="" width="40" height="40" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span>
          <strong>{song.title}</strong>
          <small>{song.artist}</small>
        </span>
      </button>
    </li>
  ))
}

function CommunityCard({ currentSongId, item, onOpen, onPlayPlaylist, onPlaySong }) {
  const [ref, seen] = useSeen()
  const preview = usePlaylistPreview(item.id, seen)
  const cover = item.artwork ?? preview.data?.thumbnail

  return (
    <article className="cs-card" ref={ref}>
      <ul className="cs-card__songs" aria-label={`Canciones de ${item.title}`}>
        <SongRows currentSongId={currentSongId} onPlaySong={onPlaySong} preview={preview} />
      </ul>
      <div className="cs-card__cover">
        <button className="cs-cover" type="button" aria-label={`Abrir ${item.title}`} onClick={() => onOpen(item.id)}>
          {cover ? <img src={sizedImage(cover, COVER_PX)} alt="" width={COVER_PX} height={COVER_PX} loading="lazy" decoding="async" /> : <span className="cs-cover__empty" aria-hidden="true" />}
        </button>
        <button className="cs-card__play" type="button" aria-label={`Reproducir ${item.title}`} title="Reproducir" onClick={() => onPlayPlaylist(item.id)}>
          <Play size={16} fill="currentColor" aria-hidden="true" />
        </button>
        <button className="cs-card__title" type="button" onClick={() => onOpen(item.id)}>{item.title}</button>
        <span className="cs-card__meta">{item.artist ?? item.meta}</span>
      </div>
    </article>
  )
}

/**
 * Bloque "De la comunidad": cada playlist en una tarjeta con sus primeras canciones a la izquierda
 * (una por fila) y su portada, título y botón de reproducir a la derecha.
 */
export default function CommunityShelf({ currentSongId, items, onOpen, onPlayPlaylist, onPlaySong, title }) {
  const id = 'community-shelf-title'
  return (
    <section className="home-shelf cs-shelf" aria-labelledby={id}>
      <ShelfHeading id={id} kind="community" title={title} />
      <div className="cs-grid">
        {items.map((item) => (
          <CommunityCard currentSongId={currentSongId} item={item} key={item.id} onOpen={onOpen} onPlayPlaylist={onPlayPlaylist} onPlaySong={onPlaySong} />
        ))}
      </div>
    </section>
  )
}
