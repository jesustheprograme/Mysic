import { ChevronLeft, Disc3, ListMusic, LoaderCircle, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { sizedImage } from '../../../lib/imageSize.js'
import { api, imageUrl } from '../../youtube/lib/api.js'
import { createOverlayScrollbarRef } from '../../../lib/overlayScrollbar.js'
import { formatTime } from '../utilidades/utilidadesMiniReproductor'

// Barra de desplazamiento superpuesta de Mysic en la ficha de álbum o artista.
const detailScrollbarRef = createOverlayScrollbarRef({ inset: 3 })

// Álbum, artista o playlist abiertos dentro del mini reproductor (antes se abrían en la ventana principal).
// Al pulsar un álbum de la discografía de un artista se apila otra vista; "Volver" desapila.

export type MiniDetailTarget = { kind: 'album' | 'artist' | 'playlist'; id: string; title?: string; thumbnail?: string }

export type MiniDetailSong = {
  id: string
  title?: string
  artist?: string
  album?: string
  albumId?: string
  artistId?: string
  durationSeconds?: number
  thumbnail?: string
  artwork?: string
}

type Release = { id: string; title?: string; thumbnail?: string; year?: string; artist?: string }

type Detail = {
  title: string
  subtitle: string
  thumbnail?: string
  songs: MiniDetailSong[]
  releases: { title: string; items: Release[] }[]
}

type ApiData = {
  title?: string
  name?: string
  artist?: string
  year?: string
  description?: string
  thumbnail?: string
  tracks?: MiniDetailSong[]
  songs?: MiniDetailSong[]
  topSongs?: MiniDetailSong[]
  shelves?: { title?: string; items?: Release[] }[]
}

function toDetail(kind: MiniDetailTarget['kind'], data: ApiData, fallback: MiniDetailTarget): Detail {
  if (kind === 'artist') {
    return {
      title: data.name ?? fallback.title ?? 'Artista',
      subtitle: 'Artista',
      thumbnail: data.thumbnail ?? fallback.thumbnail,
      songs: data.topSongs ?? [],
      releases: (data.shelves ?? [])
        .map((shelf) => ({ title: shelf.title ?? 'Álbumes', items: (shelf.items ?? []).filter((item) => item.id) }))
        .filter((shelf) => shelf.items.length > 0),
    }
  }
  if (kind === 'album') {
    return {
      title: data.title ?? fallback.title ?? 'Álbum',
      subtitle: [data.artist, data.year].filter(Boolean).join(' · '),
      thumbnail: data.thumbnail ?? fallback.thumbnail,
      songs: data.tracks ?? [],
      releases: [],
    }
  }
  return {
    title: data.title ?? fallback.title ?? 'Playlist',
    subtitle: data.description ?? '',
    thumbnail: data.thumbnail ?? fallback.thumbnail,
    songs: data.songs ?? [],
    releases: [],
  }
}

function load(target: MiniDetailTarget, signal: AbortSignal): Promise<ApiData> {
  if (target.kind === 'artist') return api.artist(target.id, signal)
  if (target.kind === 'album') return api.album(target.id, signal)
  return api.playlist(target.id, signal)
}

type Props = {
  currentSongId?: string
  onBack: () => void
  onOpen: (target: MiniDetailTarget) => void
  onPlay: (songs: MiniDetailSong[], index: number) => void
  target: MiniDetailTarget
}

export default function DetalleCatalogoMini({ currentSongId, onBack, onOpen, onPlay, target }: Props) {
  const [state, setState] = useState<{ key: string; detail?: Detail; error?: string }>({ key: '' })
  const key = `${target.kind}:${target.id}`

  useEffect(() => {
    const controller = new AbortController()
    load(target, controller.signal)
      .then((data) => setState({ key, detail: toDetail(target.kind, data ?? {}, target) }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'No se pudo cargar.' })
      })
    return () => controller.abort()
    // `target` cambia de identidad con cada render del padre; la clave basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const ready = state.key === key
  const detail = ready ? state.detail : undefined
  const thumbnail = detail?.thumbnail ?? target.thumbnail
  const isArtist = target.kind === 'artist'

  return (
    <div className="mini-detail" ref={detailScrollbarRef}>
      <button className="mini-detail__back" type="button" onClick={onBack}>
        <ChevronLeft size={15} aria-hidden="true" />
        <span>Volver</span>
      </button>

      <header className="mini-detail__header">
        {thumbnail
          ? <img className={isArtist ? 'mini-detail__art mini-detail__art--round' : 'mini-detail__art'} src={imageUrl(sizedImage(thumbnail, 96))} alt="" width="96" height="96" />
          : <span className={isArtist ? 'mini-detail__art mini-detail__art--round' : 'mini-detail__art'} aria-hidden="true" />}
        <div className="mini-detail__copy">
          <small>{isArtist ? 'Artista' : target.kind === 'album' ? 'Álbum' : 'Playlist'}</small>
          <strong>{detail?.title ?? target.title ?? ''}</strong>
          {detail?.subtitle && !isArtist && <span>{detail.subtitle}</span>}
          <button className="mini-detail__play" type="button" disabled={!detail?.songs.length} onClick={() => detail && onPlay(detail.songs, 0)}>
            <Play size={14} fill="currentColor" aria-hidden="true" />
            <span>Reproducir</span>
          </button>
        </div>
      </header>

      {!ready && <p className="mini-player__empty"><LoaderCircle className="mini-detail__spin" size={14} aria-hidden="true" /> Cargando…</p>}
      {ready && state.error && <p className="mini-player__empty" role="alert">{state.error}</p>}

      {detail && (
        <>
          {detail.songs.length > 0 ? (
            <section className="mini-detail__section" aria-label={isArtist ? 'Canciones populares' : 'Canciones'}>
              {isArtist && <h3><ListMusic size={13} aria-hidden="true" />Canciones populares</h3>}
              <ol className="mini-detail__songs">
                {detail.songs.map((song, index) => (
                  <li key={`${song.id}-${index}`}>
                    <button
                      className={song.id === currentSongId ? 'mini-detail__song mini-detail__song--active' : 'mini-detail__song'}
                      type="button"
                      onClick={() => onPlay(detail.songs, index)}
                    >
                      {isArtist || target.kind === 'playlist'
                        ? <img loading="lazy" decoding="async" src={imageUrl(sizedImage(song.thumbnail ?? song.artwork, 32))} alt="" width="32" height="32" />
                        : <span className="mini-detail__index">{index + 1}</span>}
                      <span className="mini-detail__song-copy">
                        <strong>{song.title}</strong>
                        <small>{isArtist ? song.album || song.artist : song.artist}</small>
                      </span>
                      <time>{song.durationSeconds ? formatTime(song.durationSeconds) : ''}</time>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : !detail.releases.length && <p className="mini-player__empty">No hay canciones.</p>}

          {detail.releases.map((shelf) => (
            <section className="mini-player__related-section mini-detail__section" key={shelf.title}>
              <div className="mini-player__related-heading"><h3><Disc3 size={13} aria-hidden="true" />{shelf.title}</h3></div>
              <div className="mini-player__related-grid mini-player__related-grid--albums">
                {shelf.items.map((release) => (
                  <button type="button" key={release.id} onClick={() => onOpen({ kind: 'album', id: release.id, title: release.title, thumbnail: release.thumbnail })}>
                    <img loading="lazy" decoding="async" src={imageUrl(sizedImage(release.thumbnail, 102))} alt="" width="102" height="102" />
                    <span><strong>{release.title}</strong><small>{release.year || release.artist}</small></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
