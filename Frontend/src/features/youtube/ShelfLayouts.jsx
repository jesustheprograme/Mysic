import { Disc3, ListMusic, Play, RotateCcw, UserRound, UsersRound } from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import { SongMenu } from './ItemMenus.jsx'
import { adaptSong } from './lib/adapters.js'
import './shelf-layouts.css'

const ICONS = { artists: UserRound, community: UsersRound, rail: Disc3, songs: ListMusic, tiles: RotateCcw }

/** Icono de acento que acompaña al título de cada sección (en la página y en el panel de edición). */
export function SectionIcon({ kind, size = 18 }) {
  const Icon = ICONS[kind] ?? Disc3
  return <Icon className="sl-icon" size={size} strokeWidth={1.8} aria-hidden="true" />
}

export function ShelfHeading({ action, id, kind, title }) {
  return (
    <div className="sl-heading">
      <h2 id={id}><SectionIcon kind={kind} />{title}</h2>
      {action}
    </div>
  )
}

const slug = (title) => `shelf-${title.toLocaleLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}`

/** Atajos compactos (miniatura + título + subtítulo), tres por fila: "Volver a escuchar". */
export function TileShelf({ items, onSelect, selectedId, title }) {
  const id = slug(title)
  return (
    <section className="sl-shelf" aria-labelledby={id}>
      <ShelfHeading id={id} kind="tiles" title={title} />
      <ul className="sl-tiles">
        {items.slice(0, 6).map((item) => (
          <li key={item.id}>
            <button className={`sl-tile${selectedId === item.id ? ' sl-tile--active' : ''}`} type="button" onClick={() => onSelect(item)}>
              {item.artwork ? <img src={item.artwork} alt="" width="48" height="48" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
              <span>
                <strong>{item.title}</strong>
                <small>{item.artist ?? item.meta}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const SONGS_PER_COLUMN = 4

function SongRow({ ctx, index, numbered, onPlay, selected, song }) {
  const adapted = adaptSong(song)
  return (
    <li className={`sl-song${selected ? ' sl-song--active' : ''}`}>
      <button className="sl-song__main" type="button" onClick={onPlay}>
        {numbered && <span className="sl-song__number">{index + 1}</span>}
        {song.thumbnail ? <img src={song.thumbnail} alt="" width="44" height="44" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span className="sl-song__text">
          <strong>{song.title}</strong>
          <small>{song.artist}</small>
        </span>
      </button>
      <span className="sl-song__actions">
        <HeartToggle className="heart-container--song-row" label={`Me gusta ${song.title}`} liked={ctx.likedSongIds.has(song.id)} onToggle={(liked) => ctx.toggleSongFavorite(song.id, liked, adapted)} removeLabel={`Quitar ${song.title} de favoritas`} size={16} />
        <SongMenu ctx={ctx} song={song} />
      </span>
    </li>
  )
}

/**
 * Canciones en filas, llenando por columnas (1-4 la primera, 5-8 la segunda…) como limusic.
 * Con 8 o más se numeran y usan tres columnas; con menos, son filas simples de dos por columna.
 */
export function SongShelf({ controller, items, title }) {
  const { player, playSongs } = controller
  const id = slug(title)
  const numbered = items.length >= SONGS_PER_COLUMN * 2
  const rows = numbered ? SONGS_PER_COLUMN : 2
  const visible = items.slice(0, rows * 3)
  const playAll = (
    <button className="sl-play-all" type="button" onClick={() => playSongs(items, items[0].id)}>
      <Play size={14} aria-hidden="true" /> Reproducir todo
    </button>
  )
  return (
    <section className="sl-shelf" aria-labelledby={id}>
      <ShelfHeading action={numbered ? playAll : undefined} id={id} kind="songs" title={title} />
      <ol className="sl-songs" style={{ '--sl-rows': rows }}>
        {visible.map((song, index) => (
          <SongRow
            ctx={controller}
            index={index}
            key={song.id}
            numbered={numbered}
            onPlay={() => playSongs(items, song.id)}
            selected={player.currentSong?.id === song.id}
            song={song}
          />
        ))}
      </ol>
    </section>
  )
}
