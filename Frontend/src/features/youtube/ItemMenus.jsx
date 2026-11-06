import { Disc3, Download, ListEnd, ListPlus, ListStart, Library, MoreHorizontal, Play, Radio, Share2, Shuffle, ThumbsUp, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from './lib/api.js'
import { adaptSong } from './lib/adapters.js'
import { shareUrl } from './queueOps.js'
import { showToast } from './toast.js'
import './item-menus.css'

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

/** Menú de una canción: reproducir, cola, radio, me gusta, descarga, navegación, compartir y playlist. */
export function SongMenuEntries({ ctx, song }) {
  const adapted = adaptSong(song)
  const liked = ctx.likedSongIds.has(song.id)
  const downloaded = ctx.downloadedIds.has(song.id)
  return (
    <>
      <Entry accent icon={Play} label="Reproducir" onSelect={() => ctx.playSongs([song], song.id)} />
      <Entry icon={ListStart} label="Reproducir a continuación" onSelect={() => ctx.enqueueSongs([adapted], { next: true })} />
      <Entry icon={ListEnd} label="Añadir a la cola" onSelect={() => ctx.enqueueSongs([adapted])} />
      <Entry icon={Radio} label="Iniciar radio" onSelect={() => ctx.startRadio(song)} />
      <DropdownMenuSeparator className="ym-separator" />
      <Entry icon={ThumbsUp} label={liked ? 'Quitar de tus me gusta' : 'Añadir a tus me gusta'} onSelect={() => ctx.toggleSongFavorite(song.id, !liked, adapted)} />
      <Entry icon={ListPlus} label="Añadir a playlist" onSelect={() => ctx.onAddToPlaylist(adapted)} />
      <Entry icon={downloaded ? Trash2 : Download} label={downloaded ? 'Eliminar descarga' : 'Descargar'} onSelect={() => ctx.toggleDownload(song)} />
      <DropdownMenuSeparator className="ym-separator" />
      {song.artistId && <Entry icon={UserRound} label="Ir al artista" onSelect={() => ctx.openArtist(song.artistId)} />}
      {song.albumId && <Entry icon={Disc3} label="Ir al álbum" onSelect={() => ctx.openAlbum(song.albumId)} />}
      <Entry icon={Share2} label="Compartir" onSelect={() => copyLink('song', song.id)} />
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

async function resolveSongs(kind, id) {
  if (kind === 'album') return (await api.album(id)).tracks ?? []
  if (kind === 'playlist') return (await api.playlist(id)).songs ?? []
  return []
}

/** Menú de una tarjeta (canción, álbum, playlist o artista). `entry` es el elemento original de la sección. */
export function CardMenu({ ctx, entry, title }) {
  const [busy, setBusy] = useState(false)
  const kind = entry.kind
  const collection = kind === 'album' || kind === 'playlist'

  // Resuelve las canciones de un álbum o playlist y ejecuta la acción; los fallos se avisan, no se tragan.
  const withSongs = async (action) => {
    setBusy(true)
    try {
      const songs = await resolveSongs(kind, entry.id)
      if (!songs.length) showToast('No hay canciones reproducibles')
      else action(songs)
    } catch {
      showToast('No se pudo cargar la selección')
    } finally {
      setBusy(false)
    }
  }

  const libraryLiked = kind === 'album' && ctx.likedAlbumIds.has(entry.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="home-shelf-card__menu" type="button" aria-label={`Más opciones de ${title}`}><MoreHorizontal size={16} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ym-menu" collisionPadding={8} sideOffset={6}>
        {kind === 'song' && <SongMenuEntries ctx={ctx} song={entry} />}
        {collection && (
          <>
            <Entry accent disabled={busy} icon={Play} label="Reproducir" onSelect={() => withSongs((songs) => ctx.playSongs(songs, songs[0].id))} />
            <Entry disabled={busy} icon={Shuffle} label="Reproducir en aleatorio" onSelect={() => withSongs((songs) => ctx.playShuffled(songs))} />
            <Entry disabled={busy} icon={ListStart} label="Reproducir a continuación" onSelect={() => withSongs((songs) => ctx.enqueueSongs(songs.map(adaptSong), { next: true }))} />
            <Entry disabled={busy} icon={ListEnd} label="Añadir a la cola" onSelect={() => withSongs((songs) => ctx.enqueueSongs(songs.map(adaptSong)))} />
            <DropdownMenuSeparator className="ym-separator" />
            {kind === 'album' && <Entry icon={Library} label={libraryLiked ? 'Quitar de la biblioteca' : 'Añadir a la biblioteca'} onSelect={() => ctx.toggleAlbumFavorite(entry.id, !libraryLiked)} />}
          </>
        )}
        {kind !== 'song' && entry.artistId && <Entry icon={UserRound} label="Ir al artista" onSelect={() => ctx.openArtist(entry.artistId)} />}
        {kind === 'artist' && <Entry icon={UserRound} label="Abrir artista" onSelect={() => ctx.openArtist(entry.id)} />}
        {kind !== 'song' && <Entry icon={Share2} label="Compartir" onSelect={() => copyLink(kind, entry.id)} />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
