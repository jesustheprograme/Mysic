import { useEffect, useRef, useState } from 'react'
import { Disc3, ListMusic, Play, RotateCcw, UserRound, UsersRound } from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import { sizedImage } from '../../lib/imageSize.js'
import { ctxMenu } from './contextMenuStore.js'
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
export function SeeAllButton({ expanded, onToggle }) {
  return <button className="sl-see-all" type="button" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Ver menos' : 'Ver todo'}</button>
}

const slug = (title) => `shelf-${title.toLocaleLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}`

const TILES_COLLAPSED_ROWS = 2
const TILES_EXPANDED_ROWS = 5

/** Cuántas columnas tiene ahora la rejilla (cambia con el ancho de la ventana). */
function useGridColumns(ref) {
  const [columns, setColumns] = useState(3)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setColumns(Math.max(1, getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return columns
}

/** Cuántas tarjetas mostrar: solo filas completas (sin huecos en la última), salvo que no llegue ni a una fila. */
function tileCount(total, columns, rows) {
  const wanted = Math.min(total, columns * rows)
  return wanted < columns ? wanted : Math.floor(wanted / columns) * columns
}

/** Atajos compactos (miniatura + título + subtítulo): "Volver a escuchar". Siempre filas completas. */
export function TileShelf({ items, onAlbumSelect, onArtistSelect, onItemContextMenu, onSelect, selectedId, title }) {
  const id = slug(title)
  const gridRef = useRef(null)
  const columns = useGridColumns(gridRef)
  const [expanded, setExpanded] = useState(false)
  const collapsed = tileCount(items.length, columns, TILES_COLLAPSED_ROWS)
  const shown = expanded ? tileCount(items.length, columns, TILES_EXPANDED_ROWS) : collapsed
  const canExpand = tileCount(items.length, columns, TILES_EXPANDED_ROWS) > collapsed
  return (
    <section className="sl-shelf" aria-labelledby={id}>
      <ShelfHeading action={canExpand ? <SeeAllButton expanded={expanded} onToggle={() => setExpanded((open) => !open)} /> : undefined} id={id} kind="tiles" title={title} />
      <ul className="sl-tiles" ref={gridRef}>
        {items.slice(0, shown).map((item) => (
          <li key={item.id}>
            <div className={`sl-tile${selectedId === item.id ? ' sl-tile--active' : ''}`} onContextMenu={onItemContextMenu ? (event) => onItemContextMenu(item, event) : undefined}>
              <button className="sl-tile__cover" type="button" aria-label={`Abrir ${item.title}`} onClick={() => onSelect(item)}>
                {item.artwork ? <img src={sizedImage(item.artwork, 48)} alt="" width="48" height="48" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
              </button>
              <span className="sl-song__text">
                <strong><button type="button" title={item.title} onClick={() => onSelect(item)}>{item.title}</button></strong>
                <small>
                  {/* El artista y, en las canciones con álbum, el álbum son enlaces; lo demás (p. ej. "50 tracks") es texto. */}
                  {item.artistId && onArtistSelect
                    ? <button className="sl-song__link" type="button" title={item.artist} onClick={() => onArtistSelect(item.artistId)}>{item.artist}</button>
                    : <span>{item.artist ?? item.meta}</span>}
                  {item.detailId && item.detail && onAlbumSelect && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <button className="sl-song__link" type="button" title={item.detail} onClick={() => onAlbumSelect(item.detailId)}>{item.detail}</button>
                    </>
                  )}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const SONGS_PER_COLUMN = 4
// "Ver todo" en las secciones de canciones suma 3 filas por columna, no toda la lista.
const EXPANDED_EXTRA_ROWS = 3

function SongRow({ ctx, onPlay, selected, song }) {
  const adapted = adaptSong(song)
  const liked = ctx.likedSongIds.has(song.id)
  return (
    <li
      className={`sl-song${selected ? ' sl-song--active' : ''}${liked ? ' sl-song--liked' : ''}`}
      onContextMenu={ctxMenu('song', song)}
      onFocusCapture={() => ctx.player.warmSong(song, true)}
      onPointerDown={() => ctx.player.warmSong(song, true)}
      onPointerEnter={() => ctx.player.warmSong(song)}
    >
      <div className="sl-song__main">
        <button className="sl-song__cover" type="button" aria-label={`Reproducir ${song.title}`} onClick={onPlay}>
          {song.thumbnail ? <img src={sizedImage(song.thumbnail, 44)} alt="" width="44" height="44" loading="lazy" decoding="async" /> : <i aria-hidden="true" />}
        </button>
        <span className="sl-song__text">
          <strong><button type="button" title={song.title} onClick={onPlay}>{song.title}</button></strong>
          <small>
            <button className="sl-song__link" type="button" disabled={!song.artistId} onClick={() => ctx.openArtist(song.artistId)}>{song.artist}</button>
            {song.albumId && song.album && <><span aria-hidden="true"> · </span><button className="sl-song__link" type="button" title={song.album} onClick={() => ctx.openAlbum(song.albumId)}>{song.album}</button></>}
          </small>
        </span>
      </div>
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
  const { player, playSongRadio, playSongs } = controller
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
            onPlay={() => playSongRadio(items, song.id)}
            selected={player.currentSong?.id === song.id}
            song={song}
          />
        ))}
      </ol>
    </section>
  )
}
