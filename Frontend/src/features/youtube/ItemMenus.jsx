import { Disc3, Download, ListEnd, ListPlus, ListStart, Library, MoreHorizontal, Pin, PinOff, Play, Radio, Share2, Shuffle, ThumbsDown, ThumbsUp, Trash2, UserRound, UserRoundX } from 'lucide-react'
import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { isArtistBlocked, isSongDisliked, toggleArtistBlock, toggleSongDislike } from './blockList.js'
import { closeContextMenu, useContextMenu } from './contextMenuStore.js'
import { api } from './lib/api.js'
import { adaptSong } from './lib/adapters.js'
import { isPinned, pinShortcut, shortcutOf, unpinShortcut } from './quickAccessStore.js'
import { shareUrl } from './queueOps.js'
import { noteCollectionPlay } from './recentListens.js'
import { showToast } from './toast.js'
import './item-menus.css'

/** Menú anclado a un punto de la pantalla (donde se hizo clic derecho). */
export function CursorMenu({ children, onClose, point }) {
  return (
    <DropdownMenu modal open onOpenChange={(open) => { if (!open) onClose() }}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="ym-anchor" style={{ left: point.x, top: point.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ym-menu" collisionPadding={8} sideOffset={2}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function copyLink(kind, id) {
  const url = shareUrl(kind, id)
  try {
    await navigator.clipboard.writeText(url)
    showToast('Enlace copiado')
  } catch {
    showToast('No se pudo copiar el enlace')
  }
}

function Entry({ accent = false, danger = false, disabled = false, icon: Icon, label, onSelect }) {
  return (
    <DropdownMenuItem className={`ym-item${accent ? ' ym-item--accent' : ''}${danger ? ' ym-item--danger' : ''}`} disabled={disabled} onSelect={onSelect}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
    </DropdownMenuItem>
  )
}

/** "Añadir un acceso directo" / "Quitar de accesos directos" para una canción, álbum, playlist o artista. */
function ShortcutEntry({ entry, kind }) {
  const pinned = isPinned(kind, entry.id)
  const shortcut = shortcutOf(kind, entry)
  if (!shortcut.title) return null
  return (
    <Entry
      icon={pinned ? PinOff : Pin}
      label={pinned ? 'Quitar de accesos directos' : 'Añadir un acceso directo'}
      onSelect={() => {
        if (pinned) {
          unpinShortcut(kind, entry.id)
          showToast('Acceso directo quitado')
          return
        }
        // Nunca reemplaza uno existente: con 10 en el inicio no se añade y se explica cómo hacer sitio.
        showToast(pinShortcut(shortcut) ? 'Acceso directo añadido al inicio' : 'Ya tienes 10 accesos directos: quita uno con la ✕ para añadir otro')
      }}
    />
  )
}

/** "Bloquear artista" / "Desbloquear artista": deja de salir en el Inicio y en las radios automáticas. */
function BlockArtistEntry({ id, name }) {
  if (!id) return null
  const blocked = isArtistBlocked(id)
  return (
    <Entry
      icon={UserRoundX}
      label={blocked ? 'Desbloquear artista' : 'Bloquear artista'}
      onSelect={() => showToast(toggleArtistBlock(id, name) ? `${name || 'Artista'} bloqueado: ya no saldrá en tu inicio` : `${name || 'Artista'} desbloqueado`)}
    />
  )
}

/** Menú de una canción: reproducir, cola, radio, me gusta / no me gusta, descarga, navegación, bloqueo y compartir. */
export function SongMenuEntries({ ctx, song }) {
  const adapted = adaptSong(song)
  const liked = ctx.likedSongIds.has(song.id)
  const disliked = isSongDisliked(song.id)
  const downloaded = ctx.downloadedIds.has(song.id)
  return (
    <>
      <Entry accent icon={Play} label="Reproducir" onSelect={() => ctx.playSongs([song], song.id)} />
      <Entry icon={ListStart} label="Reproducir a continuación" onSelect={() => ctx.enqueueSongs([adapted], { next: true })} />
      <Entry icon={ListEnd} label="Añadir a la cola" onSelect={() => ctx.enqueueSongs([adapted])} />
      <Entry icon={Radio} label="Iniciar radio" onSelect={() => ctx.startRadio(song)} />
      <DropdownMenuSeparator className="ym-separator" />
      <Entry icon={ThumbsUp} label={liked ? 'Quitar de tus me gusta' : 'Añadir a tus me gusta'} onSelect={() => ctx.toggleSongFavorite(song.id, !liked, adapted)} />
      <Entry
        icon={ThumbsDown}
        label={disliked ? 'Quitar el no me gusta' : 'No me gusta'}
        onSelect={() => {
          // Un "No me gusta" también retira el "Me gusta": no pueden convivir.
          const now = toggleSongDislike(song.id)
          if (now && liked) ctx.toggleSongFavorite(song.id, false, adapted)
          showToast(now ? 'No volverá a salir en tu inicio ni en las radios' : 'Se quitó el no me gusta')
        }}
      />
      <Entry icon={ListPlus} label="Añadir a playlist" onSelect={() => ctx.onAddToPlaylist(adapted)} />
      <Entry icon={downloaded ? Trash2 : Download} label={downloaded ? 'Eliminar descarga' : 'Descargar'} onSelect={() => ctx.toggleDownload(song)} />
      <DropdownMenuSeparator className="ym-separator" />
      {song.artistId && <Entry icon={UserRound} label="Ir al artista" onSelect={() => ctx.openArtist(song.artistId)} />}
      {song.albumId && <Entry icon={Disc3} label="Ir al álbum" onSelect={() => ctx.openAlbum(song.albumId)} />}
      <BlockArtistEntry id={song.artistId} name={song.artist} />
      <ShortcutEntry entry={song} kind="song" />
      <Entry icon={Share2} label="Compartir" onSelect={() => copyLink('song', song.id)} />
    </>
  )
}

async function resolveSongs(kind, id) {
  if (kind === 'album') return (await api.album(id)).tracks ?? []
  if (kind === 'playlist') return (await api.playlist(id)).songs ?? []
  return []
}

/** Opciones según el tipo de elemento: canción, álbum/playlist (con sus canciones) o artista. */
export function ItemMenuEntries({ ctx, entry, kind = entry.kind }) {
  const [busy, setBusy] = useState(false)
  if (kind === 'song') return <SongMenuEntries ctx={ctx} song={entry} />
  const collection = kind === 'album' || kind === 'playlist'

  // Resuelve las canciones de un álbum o playlist y ejecuta la acción; los fallos se avisan, no se tragan.
  const withSongs = async (action, { play = false } = {}) => {
    setBusy(true)
    try {
      const songs = await resolveSongs(kind, entry.id)
      if (!songs.length) showToast('No hay canciones reproducibles')
      else {
        if (play) noteCollectionPlay(kind, entry, songs)
        action(songs)
      }
    } catch {
      showToast('No se pudo cargar la selección')
    } finally {
      setBusy(false)
    }
  }
  const libraryLiked = kind === 'album' && ctx.likedAlbumIds.has(entry.id)

  return (
    <>
      {collection && (
        <>
          <Entry accent disabled={busy} icon={Play} label="Reproducir" onSelect={() => withSongs((songs) => ctx.playSongs(songs, songs[0].id), { play: true })} />
          <Entry disabled={busy} icon={Shuffle} label="Reproducir en aleatorio" onSelect={() => withSongs((songs) => ctx.playShuffled(songs), { play: true })} />
          <Entry disabled={busy} icon={ListStart} label="Reproducir a continuación" onSelect={() => withSongs((songs) => ctx.enqueueSongs(songs.map(adaptSong), { next: true }))} />
          <Entry disabled={busy} icon={ListEnd} label="Añadir a la cola" onSelect={() => withSongs((songs) => ctx.enqueueSongs(songs.map(adaptSong)))} />
          <DropdownMenuSeparator className="ym-separator" />
          {kind === 'album' && <Entry icon={Library} label={libraryLiked ? 'Quitar de la biblioteca' : 'Añadir a la biblioteca'} onSelect={() => ctx.toggleAlbumFavorite(entry.id, !libraryLiked)} />}
          {entry.artistId && <Entry icon={UserRound} label="Ir al artista" onSelect={() => ctx.openArtist(entry.artistId)} />}
        </>
      )}
      {kind === 'artist' && (
        <>
          <Entry accent icon={UserRound} label="Abrir artista" onSelect={() => ctx.openArtist(entry.id)} />
          <BlockArtistEntry id={entry.id} name={entry.name ?? entry.title} />
        </>
      )}
      <ShortcutEntry entry={entry} kind={kind} />
      <Entry icon={Share2} label="Compartir" onSelect={() => copyLink(kind, entry.id)} />
    </>
  )
}

/** Botón "…" con el menú de una canción (filas de las listas). */
export function SongMenu({ className = 'sl-song__more', ctx, song }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={className} type="button" aria-label={`Más opciones de ${song.title}`}><MoreHorizontal size={16} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ym-menu" collisionPadding={8} sideOffset={4}>
        <SongMenuEntries ctx={ctx} song={song} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Botón "…" de una tarjeta (canción, álbum, playlist o artista). `entry` es el elemento original de la sección. */
export function CardMenu({ align = 'start', className = 'home-shelf-card__menu', ctx, entry, title }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={className} type="button" aria-label={`Más opciones de ${title}`}><MoreHorizontal size={16} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="ym-menu" collisionPadding={8} sideOffset={6}>
        <ItemMenuEntries ctx={ctx} entry={entry} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Menú de clic derecho de toda la vista: se monta una sola vez y pinta en el cursor las opciones del elemento que
 * lo abrió (ver contextMenuStore). `ctx` es el controlador de la vista de YouTube.
 */
export function ContextMenuHost({ ctx }) {
  const menu = useContextMenu()
  if (!menu) return null
  return (
    <CursorMenu onClose={closeContextMenu} point={menu}>
      <ItemMenuEntries ctx={ctx} entry={menu.entry} kind={menu.kind} />
    </CursorMenu>
  )
}
