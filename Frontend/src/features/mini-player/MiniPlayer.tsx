import {
  Disc3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ListMusic,
  Pause,
  Pin,
  PinOff,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import {
  listenToPlaybackState,
  readPlaybackSnapshot,
  type MiniPlayerCommand,
  type MiniSong,
  type PlaybackSnapshot,
} from './playerBridge'
import {
  MINI_PLAYER_COLLAPSED_HEIGHT,
  MINI_PLAYER_EXPANDED_HEIGHT,
  MINI_PLAYER_EXPANDED_KEY,
} from './miniPlayerConfig'
import ControlVolumenMini from './componentes/ControlVolumenMini'
import {
  readStoredBoolean,
  resizeWebMiniPlayer,
  SURFACE_MOTION_MS,
  useVentanaMiniReproductor,
} from './ventana/useVentanaMiniReproductor'
import { dispatchMiniPlayerCommand, formatTime } from './utilidades/utilidadesMiniReproductor'
import './mini-player.css'

type MiniPlayerProps = {
  hostDocument?: Document
  hostWindow?: Window
}

function MiniPlayer({ hostDocument = document, hostWindow = window }: MiniPlayerProps) {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(readPlaybackSnapshot)
  const [expanded, setExpanded] = useState(() => readStoredBoolean(MINI_PLAYER_EXPANDED_KEY, false))
  const [nativeExpanded, setNativeExpanded] = useState(expanded)
  const [renderQueue, setRenderQueue] = useState(expanded)
  // On reload, the native window must restore its clip and position before the
  // expanded surface is revealed. Otherwise the CSS state can get ahead of the
  // Tauri window bounds and leave the toggle visually out of sync.
  const [surfaceOpen, setSurfaceOpen] = useState(() => expanded && !isTauri())
  const [activeQueueTab, setActiveQueueTab] = useState<'up-next' | 'search' | 'related'>('up-next')
  const [queueSearch, setQueueSearch] = useState('')
  const [clock, setClock] = useState(Date.now)
  const pendingCommandsRef = useRef<Partial<Record<'seek' | 'volume', MiniPlayerCommand>>>({})
  const commandTimerRef = useRef<number | null>(null)
  const motionTimerRef = useRef<number | null>(null)
  const revealFrameRef = useRef<number | null>(null)
  const relatedSongsRef = useRef<HTMLDivElement | null>(null)
  const relatedAlbumsRef = useRef<HTMLDivElement | null>(null)
  const relatedArtistsRef = useRef<HTMLDivElement | null>(null)
  const expandedRef = useRef(expanded)
  const seekingRef = useRef(false)
  const changingVolumeRef = useRef(false)
  const isPictureInPicture = hostWindow !== window
  const isNativeMiniPlayer = isTauri()
  const reducedMotion = useMemo(() => hostWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [hostWindow])
  const revealExpandedSurface = useCallback(() => {
    if (revealFrameRef.current !== null) hostWindow.cancelAnimationFrame(revealFrameRef.current)
    revealFrameRef.current = hostWindow.requestAnimationFrame(() => {
      revealFrameRef.current = hostWindow.requestAnimationFrame(() => {
        revealFrameRef.current = null
        if (expandedRef.current) setSurfaceOpen(true)
      })
    })
  }, [hostWindow])
  const { anchor, closeWindow, pinned, setPinned } = useVentanaMiniReproductor(
    nativeExpanded,
    hostWindow,
    reducedMotion,
    revealExpandedSurface,
  )
  const visualAnchor = isNativeMiniPlayer ? anchor : 'top-right'

  const finishCollapse = useCallback(() => {
    if (expandedRef.current) return
    if (motionTimerRef.current !== null) {
      window.clearTimeout(motionTimerRef.current)
      motionTimerRef.current = null
    }
    setRenderQueue(false)
    setNativeExpanded(false)
    if (isPictureInPicture) resizeWebMiniPlayer(hostWindow, MINI_PLAYER_COLLAPSED_HEIGHT)
  }, [hostWindow, isPictureInPicture])

  useEffect(() => {
    hostDocument.documentElement.classList.add('mini-player-document')
    if (isNativeMiniPlayer) hostDocument.documentElement.classList.add('mini-player-document--native')
    let unlisten = () => {}
    let disposed = false

    listenToPlaybackState((nextSnapshot) => {
      setSnapshot((currentSnapshot) => {
        if (!currentSnapshot) return nextSnapshot
        return {
          ...nextSnapshot,
          currentTime: seekingRef.current ? currentSnapshot.currentTime : nextSnapshot.currentTime,
          updatedAt: seekingRef.current ? currentSnapshot.updatedAt : nextSnapshot.updatedAt,
          volume: changingVolumeRef.current ? currentSnapshot.volume : nextSnapshot.volume,
        }
      })
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })

    return () => {
      disposed = true
      unlisten()
      hostDocument.documentElement.classList.remove('mini-player-document')
      hostDocument.documentElement.classList.remove('mini-player-document--native')
    }
  }, [hostDocument, isNativeMiniPlayer])

  useEffect(() => {
    if (!snapshot?.isPlaying) return undefined
    const timerId = window.setInterval(() => setClock(Date.now()), 100)
    return () => window.clearInterval(timerId)
  }, [snapshot?.isPlaying])

  useEffect(() => {
    localStorage.setItem(MINI_PLAYER_EXPANDED_KEY, String(expanded))
  }, [expanded])

  const currentTime = useMemo(() => {
    if (!snapshot) return 0
    const elapsed = snapshot.isPlaying ? Math.max(0, clock - snapshot.updatedAt) / 1000 : 0
    return Math.min(snapshot.currentTime + elapsed, snapshot.duration)
  }, [clock, snapshot])
  const progress = snapshot?.duration ? Math.min(currentTime / snapshot.duration, 1) : 0
  const track = snapshot?.track ?? null
  const queue = useMemo(() => snapshot?.queue.slice(0, 10) ?? [], [snapshot?.queue])
  const relatedQueue = useMemo(() => snapshot?.queue.slice(0, 16) ?? [], [snapshot?.queue])
  const visibleQueue = useMemo(() => {
    if (activeQueueTab === 'search') {
      const query = queueSearch.trim().toLocaleLowerCase()
      if (!query) return queue
      return queue.filter((song) => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(query))
    }

    if (activeQueueTab === 'related') {
      return track ? relatedQueue.filter((song) => song.id !== track.id) : relatedQueue
    }

    return queue
  }, [activeQueueTab, queue, queueSearch, relatedQueue, track])
  const relatedSongColumns = useMemo(() => {
    const columns: MiniSong[][] = []
    for (let index = 0; index < visibleQueue.length; index += 4) {
      columns.push(visibleQueue.slice(index, index + 4))
    }
    return columns
  }, [visibleQueue])
  const relatedAlbums = useMemo(() => {
    const albums = new Map<string, MiniSong>()
    visibleQueue.forEach((song) => {
      if (song.albumTitle && !albums.has(song.albumTitle)) albums.set(song.albumTitle, song)
    })
    return [...albums.entries()]
  }, [visibleQueue])
  const relatedArtists = useMemo(() => {
    const artists = new Map<string, MiniSong>()
    visibleQueue.forEach((song) => {
      if (!artists.has(song.artist)) artists.set(song.artist, song)
    })
    return [...artists.entries()]
  }, [visibleQueue])

  const flushPendingCommands = useCallback(() => {
    if (commandTimerRef.current !== null) {
      window.clearTimeout(commandTimerRef.current)
      commandTimerRef.current = null
    }

    const commands = Object.values(pendingCommandsRef.current)
    pendingCommandsRef.current = {}
    commands.forEach((command) => {
      if (command) dispatchMiniPlayerCommand(command)
    })
  }, [])

  function queueControlCommand(command: Extract<MiniPlayerCommand, { type: 'seek' | 'volume' }>) {
    pendingCommandsRef.current[command.type] = command
    if (commandTimerRef.current === null) {
      commandTimerRef.current = window.setTimeout(flushPendingCommands, 32)
    }
  }

  useEffect(() => () => flushPendingCommands(), [flushPendingCommands])

  useEffect(() => () => {
    if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current)
    if (revealFrameRef.current !== null) hostWindow.cancelAnimationFrame(revealFrameRef.current)
  }, [hostWindow])

  function toggleExpanded() {
    const nextExpanded = !expandedRef.current
    expandedRef.current = nextExpanded
    setExpanded(nextExpanded)
    if (motionTimerRef.current !== null) {
      window.clearTimeout(motionTimerRef.current)
      motionTimerRef.current = null
    }
    if (revealFrameRef.current !== null) {
      hostWindow.cancelAnimationFrame(revealFrameRef.current)
      revealFrameRef.current = null
    }

    if (reducedMotion) {
      setNativeExpanded(nextExpanded)
      setRenderQueue(nextExpanded)
      setSurfaceOpen(nextExpanded)
      if (isPictureInPicture) {
        const targetHeight = nextExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT
        resizeWebMiniPlayer(hostWindow, targetHeight)
      }
      return
    }

    if (nextExpanded) {
      setRenderQueue(true)
      if (nativeExpanded) {
        setSurfaceOpen(true)
      } else {
        setSurfaceOpen(false)
        setNativeExpanded(true)
      }
      if (isPictureInPicture) {
        resizeWebMiniPlayer(hostWindow, MINI_PLAYER_EXPANDED_HEIGHT)
        revealExpandedSurface()
      } else if (!isNativeMiniPlayer) {
        revealExpandedSurface()
      } else if (nativeExpanded) {
        revealExpandedSurface()
      }
      return
    }

    setSurfaceOpen(false)
    if (!surfaceOpen) {
      finishCollapse()
      return
    }
    motionTimerRef.current = window.setTimeout(() => {
      finishCollapse()
    }, SURFACE_MOTION_MS + 80)
  }

  function seekTo(nextTime: number) {
    const duration = snapshot?.duration ?? 0
    const safeTime = Math.min(Math.max(nextTime, 0), duration)
    setSnapshot((current) => current ? { ...current, currentTime: safeTime, updatedAt: Date.now() } : current)
    queueControlCommand({ type: 'seek', time: safeTime })
  }

  function changeVolume(nextVolume: number) {
    const safeVolume = Math.min(Math.max(nextVolume, 0), 100)
    setSnapshot((current) => current ? { ...current, volume: safeVolume } : current)
    queueControlCommand({ type: 'volume', value: safeVolume })
  }

  function showTrackImmediately(song: MiniSong) {
    setSnapshot((current) => current ? {
      ...current,
      currentTime: 0,
      duration: song.durationSeconds,
      track: song,
      updatedAt: Date.now(),
    } : current)
  }

  function togglePlayback() {
    setSnapshot((current) => current ? {
      ...current,
      isPlaying: !current.isPlaying,
      updatedAt: Date.now(),
    } : current)
    dispatchMiniPlayerCommand({ type: 'toggle' })
  }

  function playNext() {
    if (queue[0]) showTrackImmediately(queue[0])
    dispatchMiniPlayerCommand({ type: 'next' })
  }

  function selectQueueSong(song: MiniSong) {
    showTrackImmediately(song)
    dispatchMiniPlayerCommand({ type: 'select', songId: song.id })
  }

  function scrollRelatedCarousel(container: HTMLDivElement | null, direction: -1 | 1) {
    if (!container) return
    container.scrollBy({ left: direction * container.clientWidth, behavior: 'smooth' })
  }

  return (
    <main
      className={`mini-player${renderQueue ? ' mini-player--expanded' : ''}${surfaceOpen ? ' mini-player--surface-open' : ''}${visualAnchor.startsWith('top') ? ' mini-player--anchor-top' : ' mini-player--anchor-bottom'}`}
      aria-label="Mini reproductor de Mysic"
    >
      <section
        className="mini-player__surface"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'height' && !expandedRef.current) {
            finishCollapse()
          }
        }}
      >
        <header className="mini-player__now-playing" data-tauri-drag-region="deep">
          <div className="mini-player__track">
            {track ? <img src={track.artwork} alt="" draggable="false" /> : <span className="mini-player__artwork-placeholder" aria-hidden="true" />}
            <span className="mini-player__copy">
              <strong>{track?.title ?? 'Nada reproduciéndose'}</strong>
              <small>{track?.artist ?? 'Elige una canción en Mysic'}</small>
            </span>
          </div>

          <div className="mini-player__window-actions" data-tauri-drag-region="false">
            <ControlVolumenMini
              onVolumeChange={changeVolume}
              onVolumeInteractionChange={(active) => {
                changingVolumeRef.current = active
                if (!active) flushPendingCommands()
              }}
              volume={snapshot?.volume ?? 0}
            />
            <button
              className={isPictureInPicture || pinned ? 'mini-player__icon-button mini-player__icon-button--active' : 'mini-player__icon-button'}
              type="button"
              aria-label={isPictureInPicture ? 'Ventana siempre visible' : pinned ? 'Dejar de fijar sobre otras ventanas' : 'Fijar sobre otras ventanas'}
              title={isPictureInPicture ? 'Siempre visible por Picture-in-Picture' : pinned ? 'Siempre visible' : 'Fijar ventana'}
              onClick={() => {
                if (!isPictureInPicture) setPinned((current) => !current)
              }}
            >
              {isPictureInPicture || pinned ? <Pin size={15} fill="currentColor" aria-hidden="true" /> : <PinOff size={15} aria-hidden="true" />}
            </button>
            <button className="mini-player__icon-button" type="button" aria-label="Cerrar mini reproductor" title="Cerrar" onClick={closeWindow}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="mini-player__transport">
          <button type="button" aria-label="Canción anterior" title="Anterior" disabled={!track} onClick={() => dispatchMiniPlayerCommand({ type: 'previous' })}>
            <SkipBack size={18} fill="currentColor" aria-hidden="true" />
          </button>
          <button className="mini-player__play" type="button" aria-label={snapshot?.isPlaying ? 'Pausar' : 'Reproducir'} disabled={!track} onClick={togglePlayback}>
            {snapshot?.isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" aria-label="Canción siguiente" title="Siguiente" disabled={!track} onClick={playNext}>
            <SkipForward size={18} fill="currentColor" aria-hidden="true" />
          </button>
          <div className="mini-player__timeline">
            <input
              className="mini-player__progress-slider"
              type="range"
              min="0"
              max={snapshot?.duration || 1}
              step="0.1"
              value={currentTime}
              disabled={!track || !snapshot?.duration}
              aria-label="Posición de reproducción"
              aria-valuetext={`${formatTime(currentTime)} de ${formatTime(snapshot?.duration ?? 0)}`}
              onPointerDown={() => { seekingRef.current = true }}
              onPointerUp={() => {
                seekingRef.current = false
                flushPendingCommands()
              }}
              onPointerCancel={() => {
                seekingRef.current = false
                flushPendingCommands()
              }}
              onChange={(event) => seekTo(Number(event.target.value))}
              style={{ background: `linear-gradient(90deg, #f4f3ef 0%, #f4f3ef ${progress * 100}%, #313735 ${progress * 100}%, #313735 100%)` }}
            />
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(snapshot?.duration ?? 0)}</span>
          </div>
        </div>

        <div className="mini-player__queue-divider">
          <button
            className="mini-player__expand-toggle"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Contraer cola' : 'Mostrar las 10 canciones siguientes'}
            title={expanded ? 'Contraer' : 'Mostrar cola'}
            onClick={toggleExpanded}
          >
            {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        </div>

        <div className="mini-player__queue-shell" aria-hidden={!expanded} inert={!expanded}>
          <section className="mini-player__queue" aria-labelledby="mini-player-queue-title">
            <div className="mini-player__queue-tabs" role="tablist" aria-label="Opciones de la cola">
              <button
                className={activeQueueTab === 'up-next' ? 'mini-player__queue-tab mini-player__queue-tab--active' : 'mini-player__queue-tab'}
                id="mini-player-tab-up-next"
                type="button"
                role="tab"
                aria-controls="mini-player-queue-content"
                aria-selected={activeQueueTab === 'up-next'}
                onClick={() => setActiveQueueTab('up-next')}
              >
                <ListMusic size={15} aria-hidden="true" />
                <span id="mini-player-queue-title">A continuación</span>
              </button>
              <button
                className={activeQueueTab === 'search' ? 'mini-player__queue-tab mini-player__queue-tab--active' : 'mini-player__queue-tab'}
                id="mini-player-tab-search"
                type="button"
                role="tab"
                aria-controls="mini-player-queue-content"
                aria-selected={activeQueueTab === 'search'}
                onClick={() => setActiveQueueTab('search')}
              >
                <Search size={15} aria-hidden="true" />
                <span>Buscar</span>
              </button>
              <button
                className={activeQueueTab === 'related' ? 'mini-player__queue-tab mini-player__queue-tab--active' : 'mini-player__queue-tab'}
                id="mini-player-tab-related"
                type="button"
                role="tab"
                aria-controls="mini-player-queue-content"
                aria-selected={activeQueueTab === 'related'}
                onClick={() => setActiveQueueTab('related')}
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>Relacionado</span>
              </button>
            </div>
            <div
              className="mini-player__queue-content"
              id="mini-player-queue-content"
              role="tabpanel"
              aria-labelledby={`mini-player-tab-${activeQueueTab}`}
            >
              {activeQueueTab === 'search' && (
                <label className="mini-player__queue-search">
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    value={queueSearch}
                    placeholder="Buscar en la cola"
                    aria-label="Buscar en la cola"
                    onChange={(event) => setQueueSearch(event.target.value)}
                  />
                </label>
              )}
              {activeQueueTab === 'related' ? (
                <div className="mini-player__related">
                  <section className="mini-player__related-section" aria-labelledby="mini-player-related-songs">
                    <div className="mini-player__related-heading">
                      <h3 id="mini-player-related-songs"><ListMusic size={13} aria-hidden="true" />Canciones</h3>
                      <span className="mini-player__related-controls">
                        <button type="button" aria-label="Canciones anteriores" onClick={() => scrollRelatedCarousel(relatedSongsRef.current, -1)}>
                          <ChevronLeft size={14} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Más canciones" onClick={() => scrollRelatedCarousel(relatedSongsRef.current, 1)}>
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    {visibleQueue.length > 0 ? (
                      <div className="mini-player__related-grid mini-player__related-grid--songs" ref={relatedSongsRef}>
                        {relatedSongColumns.map((songs) => (
                          <div className="mini-player__related-song-column" key={songs[0].id}>
                            {songs.map((song) => (
                              <button type="button" key={song.id} onClick={() => selectQueueSong(song)}>
                                <img src={song.artwork} alt="" />
                                <span><strong>{song.title}</strong><small>{song.artist}</small></span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : <p>No hay canciones relacionadas.</p>}
                  </section>

                  <section className="mini-player__related-section" aria-labelledby="mini-player-related-albums">
                    <div className="mini-player__related-heading">
                      <h3 id="mini-player-related-albums"><Disc3 size={13} aria-hidden="true" />Álbumes</h3>
                      <span className="mini-player__related-controls">
                        <button type="button" aria-label="Álbumes anteriores" onClick={() => scrollRelatedCarousel(relatedAlbumsRef.current, -1)}>
                          <ChevronLeft size={14} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Más álbumes" onClick={() => scrollRelatedCarousel(relatedAlbumsRef.current, 1)}>
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    {relatedAlbums.length > 0 ? (
                      <div className="mini-player__related-grid mini-player__related-grid--albums" ref={relatedAlbumsRef}>
                        {relatedAlbums.map(([album, song]) => (
                          <button type="button" key={album} onClick={() => selectQueueSong(song)}>
                            <img src={song.artwork} alt="" />
                            <span><strong>{album}</strong><small>{song.artist}</small></span>
                          </button>
                        ))}
                      </div>
                    ) : <p>No hay álbumes relacionados.</p>}
                  </section>

                  <section className="mini-player__related-section" aria-labelledby="mini-player-related-artists">
                    <div className="mini-player__related-heading">
                      <h3 id="mini-player-related-artists"><UserRound size={13} aria-hidden="true" />Artistas</h3>
                      <span className="mini-player__related-controls">
                        <button type="button" aria-label="Artistas anteriores" onClick={() => scrollRelatedCarousel(relatedArtistsRef.current, -1)}>
                          <ChevronLeft size={14} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Más artistas" onClick={() => scrollRelatedCarousel(relatedArtistsRef.current, 1)}>
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                    {relatedArtists.length > 0 ? (
                      <div className="mini-player__related-grid mini-player__related-grid--artists" ref={relatedArtistsRef}>
                        {relatedArtists.map(([artist, song]) => (
                          <button type="button" key={artist} onClick={() => selectQueueSong(song)}>
                            <img className="mini-player__related-artist" src={song.artwork} alt="" />
                            <span><strong>{artist}</strong><small>Artista</small></span>
                          </button>
                        ))}
                      </div>
                    ) : <p>No hay artistas relacionados.</p>}
                  </section>
                </div>
              ) : visibleQueue.length > 0 ? (
                <ol className="mini-player__queue-list">
                  {visibleQueue.map((song) => (
                    <li key={song.id}>
                      <button type="button" onClick={() => selectQueueSong(song)}>
                        <span className="mini-player__queue-index">{queue.findIndex((item) => item.id === song.id) + 1}</span>
                        <img src={song.artwork} alt="" />
                        <span className="mini-player__queue-copy">
                          <strong>{song.title}</strong>
                          <small>{song.artist}</small>
                        </span>
                        <time>{formatTime(song.durationSeconds)}</time>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mini-player__empty">
                  {activeQueueTab === 'search'
                      ? 'No se encontraron canciones.'
                      : 'La cola aparecerá cuando reproduzcas una canción.'}
                </p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default MiniPlayer
