import { useState } from 'react'
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

/** Botón de la cabecera que despliega la sección entera y la vuelve a plegar. */
function SeeAllButton({ expanded, onToggle }) {
  return <button className="sl-see-all" type="button" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Ver menos' : 'Ver todo'}</button>
}

const slug = (title) => `shelf-${title.toLocaleLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}`

const TILES_COLLAPSED = 6
const TILES_PER_ROW = 3
// "Ver todo" suma 3 filas a lo que ya se ve, no toda la lista.
const EXPANDED_EXTRA_ROWS = 3

/** Atajos compactos (miniatura + título + subtítulo), tres por fila: "Volver a escuchar". */
export function TileShelf({ items, onSelect, selectedId, title }) {
  const id = slug(title)
  const [expanded, setExpanded] = useState(false)
  const canExpand = items.length > TILES_COLLAPSED
  return (
    <section className="sl-shelf" aria-labelledby={id}>
      <ShelfHeading action={canExpand ? <SeeAllButton expanded={expanded} onToggle={() => setExpanded((open) => !open)} /> : undefined} id={id} kind="tiles" title={title} />
      <ul className="sl-tiles">
        {items.slice(0, expanded ? TILES_COLLAPSED + TILES_PER_ROW * EXPANDED_EXTRA_ROWS : TILES_COLLAPSED).map((item) => (
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

function SongRow({ ctx, onPlay, selected, song }) {
  const adapted = adaptSong(song)
  const liked = ctx.likedSongIds.has(song.id)
  return (
    <li className={`sl-song${selected ? ' sl-song--active' : ''}${liked ? ' sl-song--liked' : ''}`}>
      <button className="sl-song__main" type="button" onClick={onPlay}>
        {song.thumbnail ? <img src={song.thumbnail} alt="" width="44" height="44" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        <span className="sl-song__text">
          <strong>{song.title}</strong>
          <small>{song.artist}</small>
        </span>
      </button>
      <span className="sl-song__actions">
        <HeartToggle className="heart-container--song-row" label={`Me gusta ${song.title}`} liked={liked} onToggle={(liked) => ctx.toggleSongFavorite(song.id, liked, adapted)} removeLabel={`Quitar ${song.title} de favoritas`} size={16} />
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
  const [expanded, setExpanded] = useState(false)
  const numbered = items.length >= SONGS_PER_COLUMN * 2
  const collapsedRows = numbered ? SONGS_PER_COLUMN : 2
  const canExpand = items.length > collapsedRows * 3
  // Desplegada suma 3 filas por columna; las canciones siguen en tres columnas.
  const rows = expanded ? Math.min(Math.ceil(items.length / 3), collapsedRows + EXPANDED_EXTRA_ROWS) : collapsedRows
  const visible = items.slice(0, rows * 3)
  const playAll = (
    <button className="sl-play-all" type="button" onClick={() => playSongs(items, items[0].id)}>
      <Play size={14} aria-hidden="true" /> Reproducir todo
    </button>
  )
  return (
    <section className="sl-shelf" aria-labelledby={id}>
      <ShelfHeading action={(numbered || canExpand) ? <span className="sl-heading__actions">{numbered && playAll}{canExpand && <SeeAllButton expanded={expanded} onToggle={() => setExpanded((open) => !open)} />}</span> : undefined} id={id} kind="songs" title={title} />
      <ol className="sl-songs" style={{ '--sl-rows': rows }}>
        {visible.map((song) => (
          <SongRow
            ctx={controller}
            key={song.id}
            onPlay={() => playSongs(items, song.id)}
            selected={player.currentSong?.id === song.id}
            song={song}
          />
        ))}
      </ol>
    </section>
  )
}
