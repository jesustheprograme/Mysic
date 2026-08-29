import {
  ChevronDown,
  ChevronUp,
  ListMusic,
  Pause,
  Pin,
  PinOff,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  PhysicalPosition,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from '@tauri-apps/api/window'
import {
  listenToPlaybackState,
  readPlaybackSnapshot,
  sendMiniPlayerCommand,
  type MiniPlayerCommand,
  type MiniSong,
  type PlaybackSnapshot,
} from './playerBridge'
import {
  MINI_PLAYER_COLLAPSED_HEIGHT,
  MINI_PLAYER_EXPANDED_HEIGHT,
  MINI_PLAYER_EXPANDED_KEY,
  MINI_PLAYER_WIDTH,
} from './miniPlayerConfig'
import './mini-player.css'

const SURFACE_MOTION_MS = 180
const ANCHOR_KEY = 'mysic-mini-player-anchor-v1'
const PINNED_KEY = 'mysic-mini-player-pinned-v1'
const POSITION_KEY = 'mysic-mini-player-position-v1'

type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
type StoredPosition = { x: number; y: number }

async function getPlacementMonitor() {
  return (await currentMonitor()) ?? (await primaryMonitor())
}

function readStoredBoolean(key: string, fallback: boolean) {
  const storedValue = localStorage.getItem(key)
  return storedValue === null ? fallback : storedValue === 'true'
}

function readStoredPosition(): StoredPosition | null {
  try {
    const position = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Partial<StoredPosition> | null
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      return { x: position.x as number, y: position.y as number }
    }
  } catch {
    // Ignore malformed values from older development builds.
  }
  return null
}

function storePosition(position: StoredPosition) {
  localStorage.setItem(POSITION_KEY, JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y) }))
}

function resizeWebMiniPlayer(hostWindow: Window, targetInnerHeight: number) {
  const frameHeight = Math.max(0, hostWindow.outerHeight - hostWindow.innerHeight)
  const targetOuterHeight = targetInnerHeight + frameHeight
  const targetOuterWidth = hostWindow.outerWidth || MINI_PLAYER_WIDTH
  hostWindow.resizeTo(targetOuterWidth, targetOuterHeight)
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function dispatchMiniPlayerCommand(command: Parameters<typeof sendMiniPlayerCommand>[0]) {
  sendMiniPlayerCommand(command).catch(() => {})
}

type MiniVolumeControlProps = {
  onVolumeChange: (volume: number) => void
  onVolumeInteractionChange: (active: boolean) => void
  volume: number
}

function MiniVolumeControl({ onVolumeChange, onVolumeInteractionChange, volume }: MiniVolumeControlProps) {
  const [open, setOpen] = useState(false)
  const VolumeIcon = volume === 0 ? VolumeX : Volume2

  return (
    <div
      className={`mini-player__volume-popover${open ? ' mini-player__volume-popover--open' : ''}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) setOpen(false)
      }}
    >
      <label className="mini-player__volume-slider-shell" title={`Volumen ${volume}%`}>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          tabIndex={open ? 0 : -1}
          aria-label="Volumen"
          onPointerDown={() => onVolumeInteractionChange(true)}
          onPointerUp={() => onVolumeInteractionChange(false)}
          onPointerCancel={() => onVolumeInteractionChange(false)}
          onBlur={() => onVolumeInteractionChange(false)}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          style={{ background: `linear-gradient(90deg, #a78bfa 0%, #a78bfa ${volume}%, #313735 ${volume}%, #313735 100%)` }}
        />
      </label>
      <button
        className="mini-player__icon-button"
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Contraer control de volumen' : 'Mostrar control de volumen'}
        title={`Volumen ${volume}%`}
        onClick={() => setOpen(true)}
      >
        <VolumeIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function getNearestCorner(
  position: { x: number; y: number },
  size: { width: number; height: number },
  monitor: Monitor,
): Corner {
  const workArea = monitor.workArea
  const centerX = position.x + size.width / 2
  const centerY = position.y + size.height / 2
  const workCenterX = workArea.position.x + workArea.size.width / 2
  const workCenterY = workArea.position.y + workArea.size.height / 2
  const horizontal = centerX < workCenterX ? 'left' : 'right'
  const vertical = centerY < workCenterY ? 'top' : 'bottom'
  return `${vertical}-${horizontal}` as Corner
}

function getAnchorAfterMove(
  position: StoredPosition,
  size: { width: number; height: number },
  monitor: Monitor,
  currentAnchor: Corner,
  previousPosition: StoredPosition | null,
) {
  const nearestAnchor = getNearestCorner(position, size, monitor)
  if (!previousPosition) return nearestAnchor

  const verticalTravel = Math.abs(position.y - previousPosition.y)
  const changedVerticalAnchor = verticalTravel >= 24 * monitor.scaleFactor
  const vertical = changedVerticalAnchor
    ? (nearestAnchor.startsWith('top') ? 'top' : 'bottom')
    : (currentAnchor.startsWith('top') ? 'top' : 'bottom')
  const horizontal = nearestAnchor.endsWith('left') ? 'left' : 'right'
  return `${vertical}-${horizontal}` as Corner
}

function clampToWorkArea(value: number, start: number, length: number, windowLength: number) {
  return Math.min(Math.max(value, start), Math.max(start, start + length - windowLength))
}

function getSurfaceOffset(windowHeight: number, visibleHeight: number, expanded: boolean, anchor: Corner) {
  return !expanded && anchor.startsWith('bottom') ? windowHeight - visibleHeight : 0
}

function getSurfacePosition(
  windowPosition: StoredPosition,
  windowHeight: number,
  visibleHeight: number,
  expanded: boolean,
  anchor: Corner,
) {
  return {
    x: windowPosition.x,
    y: windowPosition.y + getSurfaceOffset(windowHeight, visibleHeight, expanded, anchor),
  }
}

function useNativeMiniWindow(
  windowExpanded: boolean,
  hostWindow: Window,
  reducedMotion: boolean,
  onExpandedLayoutReady: () => void,
) {
  const [pinned, setPinned] = useState(() => readStoredBoolean(PINNED_KEY, true))
  const [anchor, setAnchor] = useState<Corner>(() => (localStorage.getItem(ANCHOR_KEY) as Corner | null) ?? 'bottom-right')
  const anchorRef = useRef<Corner>(anchor)
  const windowExpandedRef = useRef(windowExpanded)
  const animationTokenRef = useRef(0)
  const layoutSequenceRef = useRef(0)
  const hasNativeLayoutRef = useRef(false)
  const lastPositionRef = useRef<StoredPosition | null>(null)
  const positionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isTauri()) return undefined

    const appWindow = getCurrentWindow()
    let disposed = false
    let unlistenMoved = () => {}

    appWindow.onMoved(({ payload: position }) => {
      if (animationTokenRef.current > 0) return
      if (positionTimerRef.current !== null) window.clearTimeout(positionTimerRef.current)
      positionTimerRef.current = window.setTimeout(async () => {
        positionTimerRef.current = null
        if (disposed || animationTokenRef.current > 0) return

        const [monitor, size] = await Promise.all([
          getPlacementMonitor().catch(() => null),
          appWindow.outerSize().catch(() => null),
        ])
        if (disposed || !monitor || !size) return

        const currentAnchor = anchorRef.current
        const currentExpanded = windowExpandedRef.current
        const visibleHeight = (currentExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
        const visiblePosition = getSurfacePosition(position, size.height, visibleHeight, currentExpanded, currentAnchor)
        const nextAnchor = getAnchorAfterMove(
          visiblePosition,
          { width: size.width, height: visibleHeight },
          monitor,
          currentAnchor,
          lastPositionRef.current,
        )
        const anchorChangedVertically = currentAnchor.startsWith('top') !== nextAnchor.startsWith('top')

        if (!currentExpanded && anchorChangedVertically) {
          const token = ++layoutSequenceRef.current
          animationTokenRef.current = token
          const clipY = getSurfaceOffset(size.height, visibleHeight, false, nextAnchor)
          const targetPosition = new PhysicalPosition(position.x, Math.round(visiblePosition.y - clipY))
          await invoke('set_mini_player_bounds', {
            clipHeight: Math.round(visibleHeight),
            clipY: Math.round(clipY),
            height: Math.round(size.height),
            width: Math.round(size.width),
            x: targetPosition.x,
            y: targetPosition.y,
          }).catch(() => {})
          window.setTimeout(() => {
            if (animationTokenRef.current === token) animationTokenRef.current = 0
          }, 80)
        }

        storePosition(visiblePosition)
        lastPositionRef.current = visiblePosition
        anchorRef.current = nextAnchor
        setAnchor(nextAnchor)
        localStorage.setItem(ANCHOR_KEY, nextAnchor)
      }, 100)
    }).then((unlisten) => {
      if (disposed) unlisten()
      else unlistenMoved = unlisten
    })

    return () => {
      disposed = true
      if (positionTimerRef.current !== null) window.clearTimeout(positionTimerRef.current)
      unlistenMoved()
    }
  }, [hostWindow])

  useEffect(() => {
    localStorage.setItem(PINNED_KEY, String(pinned))
    if (isTauri()) getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {})
  }, [pinned])

  useEffect(() => {
    if (!isTauri()) return undefined

    const appWindow = getCurrentWindow()
    const isInitialLayout = !hasNativeLayoutRef.current
    const previousWindowExpanded = windowExpandedRef.current
    windowExpandedRef.current = windowExpanded
    hasNativeLayoutRef.current = true
    const token = ++layoutSequenceRef.current
    let cancelled = false
    let settleTimer: number | null = null

    animationTokenRef.current = token
    if (positionTimerRef.current !== null) {
      window.clearTimeout(positionTimerRef.current)
      positionTimerRef.current = null
    }

    const resizeAndAnchor = async () => {
      const monitor = await getPlacementMonitor().catch(() => null)
      if (cancelled) return
      if (!monitor) {
        animationTokenRef.current = 0
        await appWindow.show()
        if (windowExpanded) onExpandedLayoutReady()
        return
      }
      const [currentPosition, currentSize] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ])
      if (cancelled) return

      const targetSize = {
        width: MINI_PLAYER_WIDTH * monitor.scaleFactor,
        height: MINI_PLAYER_EXPANDED_HEIGHT * monitor.scaleFactor,
      }
      const previousVisibleHeight = (previousWindowExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
      const currentVisiblePosition = getSurfacePosition(
        currentPosition,
        currentSize.height,
        previousVisibleHeight,
        previousWindowExpanded,
        anchorRef.current,
      )
      const storedPosition = isInitialLayout ? readStoredPosition() : null
      const nextAnchor = isInitialLayout
        ? anchorRef.current
        : getAnchorAfterMove(
          currentVisiblePosition,
          { width: currentSize.width, height: previousVisibleHeight },
          monitor,
          anchorRef.current,
          lastPositionRef.current,
        )
      const targetVisibleHeight = (windowExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
      const desiredVisiblePosition = storedPosition ?? {
        x: currentVisiblePosition.x,
        y: nextAnchor.startsWith('bottom')
          ? currentVisiblePosition.y + previousVisibleHeight - targetVisibleHeight
          : currentVisiblePosition.y,
      }
      const targetVisiblePosition = {
        x: Math.round(clampToWorkArea(desiredVisiblePosition.x, monitor.workArea.position.x, monitor.workArea.size.width, targetSize.width)),
        y: Math.round(clampToWorkArea(desiredVisiblePosition.y, monitor.workArea.position.y, monitor.workArea.size.height, targetVisibleHeight)),
      }
      const clipY = getSurfaceOffset(targetSize.height, targetVisibleHeight, windowExpanded, nextAnchor)
      const targetPosition = new PhysicalPosition(
        targetVisiblePosition.x,
        Math.round(targetVisiblePosition.y - clipY),
      )

      anchorRef.current = nextAnchor
      setAnchor(nextAnchor)
      localStorage.setItem(ANCHOR_KEY, nextAnchor)

      await invoke('set_mini_player_bounds', {
        clipHeight: Math.round(targetVisibleHeight),
        clipY: Math.round(clipY),
        height: Math.round(targetSize.height),
        width: Math.round(targetSize.width),
        x: targetPosition.x,
        y: targetPosition.y,
      })
      if (cancelled) return
      await appWindow.show()
      lastPositionRef.current = targetVisiblePosition
      storePosition(targetVisiblePosition)
      if (windowExpanded) onExpandedLayoutReady()

      settleTimer = window.setTimeout(() => {
        if (animationTokenRef.current === token) animationTokenRef.current = 0
      }, windowExpanded && !reducedMotion ? SURFACE_MOTION_MS + 80 : 80)
    }

    const runResize = () => {
      resizeAndAnchor().catch(() => {
        if (animationTokenRef.current === token) animationTokenRef.current = 0
        if (windowExpanded) onExpandedLayoutReady()
      })
    }

    runResize()

    return () => {
      cancelled = true
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      if (animationTokenRef.current === token) animationTokenRef.current = 0
    }
  }, [onExpandedLayoutReady, reducedMotion, windowExpanded])

  const closeWindow = useCallback(() => {
    if (isTauri()) getCurrentWindow().close().catch(() => {})
    else hostWindow.close()
  }, [hostWindow])

  return { anchor, closeWindow, pinned, setPinned }
}

type MiniPlayerProps = {
  hostDocument?: Document
  hostWindow?: Window
}

function MiniPlayer({ hostDocument = document, hostWindow = window }: MiniPlayerProps) {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(readPlaybackSnapshot)
  const [expanded, setExpanded] = useState(() => readStoredBoolean(MINI_PLAYER_EXPANDED_KEY, false))
  const [nativeExpanded, setNativeExpanded] = useState(expanded)
  const [renderQueue, setRenderQueue] = useState(expanded)
  const [surfaceOpen, setSurfaceOpen] = useState(expanded)
  const [clock, setClock] = useState(Date.now)
  const pendingCommandsRef = useRef<Partial<Record<'seek' | 'volume', MiniPlayerCommand>>>({})
  const commandTimerRef = useRef<number | null>(null)
  const motionTimerRef = useRef<number | null>(null)
  const revealFrameRef = useRef<number | null>(null)
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
  const { anchor, closeWindow, pinned, setPinned } = useNativeMiniWindow(
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
  const queue = snapshot?.queue.slice(0, 10) ?? []

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
            <MiniVolumeControl
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
              style={{ background: `linear-gradient(90deg, #9b7bff 0%, #c8b8ff ${progress * 100}%, #313735 ${progress * 100}%, #313735 100%)` }}
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
            <div className="mini-player__queue-heading">
              <span><ListMusic size={16} aria-hidden="true" /><strong id="mini-player-queue-title">A continuación</strong></span>
              <small>{queue.length} canciones</small>
            </div>
            {queue.length > 0 ? (
              <ol className="mini-player__queue-list">
                {queue.map((song, index) => (
                  <li key={song.id}>
                    <button type="button" onClick={() => selectQueueSong(song)}>
                      <span className="mini-player__queue-index">{index + 1}</span>
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
              <p className="mini-player__empty">La cola aparecerá cuando reproduzcas una canción.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export default MiniPlayer
