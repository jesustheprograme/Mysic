import { Disc3, Heart, ListMusic, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import './library-grid.css'


const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/** Álbumes y artistas se deducen de las canciones que te gustan (la biblioteca de YouTube solo trae playlists y Me gusta). */
function deriveLibraryEntities(likedSongs) {
  const albums = new Map()
  const artists = new Map()
  likedSongs.forEach((song) => {
    if (song.albumId && song.album && !albums.has(song.albumId)) {
      albums.set(song.albumId, { id: song.albumId, kind: 'album', title: song.album, subtitle: `Álbum · ${song.artist ?? ''}`.replace(/ · $/, ''), artwork: song.thumbnail })
    }
    if (song.artistId) {
      const current = artists.get(song.artistId)
      if (current) current.count += 1
      else artists.set(song.artistId, { id: song.artistId, kind: 'artist', title: song.artist, artwork: song.thumbnail, count: 1 })
    }
  })
  return {
    albums: [...albums.values()],
    artists: [...artists.values()].map(({ count, ...artist }) => ({ ...artist, subtitle: `Artista · ${plural(count, 'canción', 'canciones')}` })),
  }
}

function LibraryCard({ item, onOpen }) {
  const Fallback = item.kind === 'artist' ? UserRound : item.kind === 'album' ? Disc3 : ListMusic
  return (
    <li>
      <button className={`lib-card${item.kind === 'artist' ? ' lib-card--round' : ''}${item.special ? ' lib-card--liked' : ''}`} type="button" onClick={() => onOpen(item)}>
        <span className="lib-card__art">
          {item.special
            ? <Heart size={56} strokeWidth={1.6} fill="currentColor" aria-hidden="true" />
            : item.artwork
              ? <img src={item.artwork} alt="" loading="lazy" decoding="async" />
              : <Fallback size={40} strokeWidth={1.4} aria-hidden="true" />}
        </span>
        <strong title={item.title}>{item.title}</strong>
        <small>{item.subtitle}</small>
      </button>
    </li>
  )
}

/** Cuadrícula de la pestaña activa de la biblioteca (Todo, Playlists, Álbumes o Artistas). */
export default function LibraryGrid({ data, onOpen, tab }) {
  const items = useMemo(() => {
    const liked = {
      id: 'liked', kind: 'liked', special: true, title: 'Música que me gusta',
      subtitle: `Lista de YouTube · ${plural(data.likedSongs.length, 'canción', 'canciones')}`,
    }
    const playlists = data.playlists.map((playlist) => ({
      id: playlist.id, kind: 'playlist', title: playlist.title, artwork: playlist.thumbnail,
      subtitle: plural(playlist.itemCount ?? 0, 'canción', 'canciones'),
    }))
    const { albums, artists } = deriveLibraryEntities(data.likedSongs)
    if (tab === 'playlists') return [liked, ...playlists]
    if (tab === 'albums') return albums
    if (tab === 'artists') return artists
    return [liked, ...playlists, ...albums, ...artists]
  }, [data, tab])

  if (!items.length) return <p className="collection-empty" role="status">Aún no hay nada en esta sección.</p>
  return (
    <ul className="lib-grid">
      {items.map((item) => <LibraryCard item={item} key={`${item.kind}-${item.id}`} onOpen={onOpen} />)}
    </ul>
  )
}
