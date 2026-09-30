import {
  ListMusic,
  MoreVertical,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { listenToMiniPlayerCommands } from '../features/mini-player/playerBridge.ts'
import HeartToggle from './HeartToggle.jsx'

function PlayerPanelToggleIcon({ collapsed }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d={collapsed
          ? 'M11.28 9.53L8.81 12l2.47 2.47a.749.749 0 0 1-.326 1.275.75.75 0 0 1-.734-.215l-3-3a.75.75 0 0 1 0-1.06l3-3a.749.749 0 0 1 1.275.326.75.75 0 0 1-.215.734'
          : 'M7.22 14.47L9.69 12 7.22 9.53a.749.749 0 0 1 .326-1.275.75.75 0 0 1 .734.215l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.042-.018.75.75 0 0 1-.018-1.042'}
      />
      <path
        fill="currentColor"
        d="M3.75 2h16.5c.966 0 1.75.784 1.75 1.75v16.5A1.75 1.75 0 0 1 20.25 22H3.75A1.75 1.75 0 0 1 2 20.25V3.75C2 2.784 2.784 2 3.75 2M3.5 3.75v16.5c0 .138.112.25.25.25H15v-17H3.75a.25.25 0 0 0-.25.25m13 16.75h3.75a.25.25 0 0 0 .25-.25V3.75a.25.25 0 0 0-.25-.25H16.5Z"
      />
    </svg>
  )
}

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function createWaveformPeaks(seed, count = 96) {
  let hash = Array.from(String(seed ?? 'track')).reduce((value, character) => (
    ((value * 31) + character.charCodeAt(0)) >>> 0
  ), 7)

  return Array.from({ length: count }, (_, index) => {
    hash = (hash * 1664525 + 1013904223) >>> 0
    const noise = hash / 0xffffffff
    const envelope = 0.55 + Math.sin((index / count) * Math.PI) * 0.45
    return Math.min(1, Math.max(0.12, (0.35 + noise * 0.65) * envelope))
  })
}

function VolumeControl({ expanded, onExpandedChange, onVolumeChange, volume }) {
  const Icon = volume === 0 ? VolumeX : Volume2
  const closeTimerRef = useRef(null)
  const [hoverOpen, setHoverOpen] = useState(false)
  const open = expanded || hoverOpen

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  function openFromPointer() {
    clearTimeout(closeTimerRef.current)
    setHoverOpen(true)
  }

  function closeFromPointer() {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setHoverOpen(false), 320)
  }

  return (
    <div
      className={`volume-control${open ? ' volume-control--open' : ''}${expanded ? ' volume-control--pinned' : ''}`}
      onPointerEnter={openFromPointer}
      onPointerLeave={closeFromPointer}
    >
      <input
        className="volume-control__level"
        type="range"
        min="0"
        max="100"
        value={volume}
        aria-label="Volumen"
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        style={{ '--volume-level': `${volume}%` }}
      />
      <button
        className="volume-control__button"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Cerrar control de volumen' : 'Mantener control de volumen abierto'}
        title={expanded ? 'Cerrar control de volumen' : 'Mantener control de volumen abierto'}
        onClick={() => onExpandedChange(!expanded)}
      >
        <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  )
}

function PlayerDiscoveryLoader() {
  return (
    <div className="player-discovery-loader" role="status" aria-live="polite">
      <p>Preparando tu descubrimiento</p>
      <div className="player-discovery-loader__spinner-container" aria-hidden="true">
        <div className="player-discovery-loader__spinner" />
      </div>
      <span>Estamos mezclando canciones para ti</span>
    </div>
  )
}

function PlayerDock({ animationNonce, collapsed = false, isLoading = false, liked = false, onClose, onNext, onOpenMiniPlayer, onPlaybackChange, onPlaybackStateChange, onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, playbackToggleNonce, queue, track }) {
  const PAUSE_FADE_DURATION_MS = 400
  const waveformRef = useRef(null)
  const waveSurferRef = useRef(null)
  const hasMountedRef = useRef(false)
  const previousTrackRef = useRef({ audioUrl: track.audioUrl, id: track.id })
  const trackDurationRef = useRef(track.durationSeconds ?? 0)
  const volumeRef = useRef(75)
  const pauseFadeRef = useRef({ frameId: null, resolve: null, promise: null, waveSurfer: null })
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const playbackStateRef = useRef({
    currentTime: 0,
    duration: track.durationSeconds ?? 0,
    isPlaying: false,
    volume: 75,
  })
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(track.durationSeconds ?? 0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(75)
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const [animationEnabled, setAnimationEnabled] = useState(true)
  const hasAudio = Boolean(track.audioUrl)

  const notifyPlaybackState = useCallback((patch) => {
    const nextPlaybackState = { ...playbackStateRef.current, ...patch }
    playbackStateRef.current = nextPlaybackState
    onPlaybackStateChangeRef.current?.(nextPlaybackState)
  }, [])

  const updatePlaybackState = useCallback((nextIsPlaying) => {
    setIsPlaying(nextIsPlaying)
    onPlaybackChange(nextIsPlaying)
    notifyPlaybackState({ isPlaying: nextIsPlaying })
  }, [notifyPlaybackState, onPlaybackChange])

  useEffect(() => {
    trackDurationRef.current = track.durationSeconds ?? 0
  }, [track.durationSeconds])

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange
  }, [onPlaybackStateChange])

  const setOutputVolume = useCallback((nextVolume) => {
    const normalizedVolume = Math.min(Math.max(nextVolume / 100, 0), 1)
    waveSurferRef.current?.setVolume(normalizedVolume)
  }, [])

  const stopPauseFade = useCallback((restoreVolume = true, resumePlayback = false) => {
    const activeFade = pauseFadeRef.current
    if (activeFade.frameId !== null) cancelAnimationFrame(activeFade.frameId)
    if (restoreVolume) setOutputVolume(volumeRef.current)
    if (resumePlayback && activeFade.waveSurfer) {
      const resumedTime = activeFade.waveSurfer.getCurrentTime()
      setCurrentTime(resumedTime)
      notifyPlaybackState({ currentTime: resumedTime })
      updatePlaybackState(true)
    }
    activeFade.resolve?.(false)
    pauseFadeRef.current = { frameId: null, resolve: null, promise: null, waveSurfer: null }
  }, [notifyPlaybackState, setOutputVolume, updatePlaybackState])

  const pauseWithFade = useCallback(() => {
    const waveSurfer = waveSurferRef.current
    if (!waveSurfer || !hasAudio) return Promise.resolve(false)

    if (pauseFadeRef.current.promise) return pauseFadeRef.current.promise

    const startVolume = volumeRef.current / 100
    if (startVolume <= 0) {
      const pausedAt = waveSurfer.getCurrentTime()
      setCurrentTime(pausedAt)
      notifyPlaybackState({ currentTime: pausedAt })
      updatePlaybackState(false)
      waveSurfer.pause()
      setOutputVolume(volumeRef.current)
      return Promise.resolve(true)
    }

    const fadePromise = new Promise((resolve) => {
      const pausedAt = waveSurfer.getCurrentTime()
      setCurrentTime(pausedAt)
      notifyPlaybackState({ currentTime: pausedAt })
      updatePlaybackState(false)

      const finishFade = () => {
        waveSurfer.pause()
        pauseFadeRef.current = { frameId: null, resolve: null, promise: null, waveSurfer: null }
        resolve(true)
      }

      const startedAt = performance.now()
      const step = (frameTime) => {
        if (pauseFadeRef.current.waveSurfer !== waveSurfer) {
          resolve(false)
          return
        }

        const elapsed = frameTime - startedAt
        const progress = Math.min(elapsed / PAUSE_FADE_DURATION_MS, 1)
        waveSurfer.setVolume(startVolume * ((1 - progress) ** 2))

        if (progress < 1) {
          pauseFadeRef.current.frameId = requestAnimationFrame(step)
          return
        }

        finishFade()
      }

      pauseFadeRef.current = {
        frameId: requestAnimationFrame(step),
        resolve,
        promise: null,
        waveSurfer,
      }
    })

    pauseFadeRef.current.promise = fadePromise
    return fadePromise
  }, [hasAudio, notifyPlaybackState, setOutputVolume, updatePlaybackState])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return undefined
    }

    setAnimationEnabled(false)
    const frameId = requestAnimationFrame(() => setAnimationEnabled(true))
    return () => cancelAnimationFrame(frameId)
  }, [animationNonce])

  useEffect(() => {
    const container = waveformRef.current
    if (!container || !hasAudio) return undefined

    const media = new Audio(track.audioUrl)
    media.preload = 'auto'
    media.hidden = true
    media.muted = false
    media.setAttribute('aria-hidden', 'true')
    container.appendChild(media)

    const mediaDuration = Number.isFinite(track.durationSeconds) && track.durationSeconds > 0
      ? track.durationSeconds
      : 1

    const waveSurfer = WaveSurfer.create({
      barGap: 1,
      barRadius: 2,
      barWidth: 2,
      container,
      cursorColor: 'transparent',
      cursorWidth: 0,
      dragToSeek: { debounceTime: 30 },
      height: 18,
      media,
      normalize: true,
      peaks: [createWaveformPeaks(track.id)],
      progressColor: '#e7e9e5',
      duration: mediaDuration,
      waveColor: '#414846',
      url: track.audioUrl,
    })

    waveSurferRef.current = waveSurfer
    waveSurfer.setVolume(volumeRef.current / 100)
    const cleanups = [
      waveSurfer.on('ready', (readyDuration) => {
        const nextDuration = readyDuration || trackDurationRef.current || 0
        setDuration(nextDuration)
        setCurrentTime(0)
        notifyPlaybackState({ currentTime: 0, duration: nextDuration })
        waveSurfer.play().catch(() => updatePlaybackState(false))
      }),
      waveSurfer.on('play', () => {
        if (!pauseFadeRef.current.promise) setOutputVolume(volumeRef.current)
        updatePlaybackState(true)
      }),
      waveSurfer.on('pause', () => updatePlaybackState(false)),
      waveSurfer.on('timeupdate', (time) => {
        if (pauseFadeRef.current.promise) return
        setCurrentTime(time)
        notifyPlaybackState({ currentTime: time })
      }),
      waveSurfer.on('finish', () => {
        const finishedAt = waveSurfer.getDuration()
        setCurrentTime(finishedAt)
        notifyPlaybackState({ currentTime: finishedAt })
        updatePlaybackState(false)
      }),
      waveSurfer.on('error', () => updatePlaybackState(false)),
    ]

    return () => {
      stopPauseFade(false)
      cleanups.forEach((cleanup) => cleanup())
      waveSurfer.destroy()
      media.pause()
      media.removeAttribute('src')
      media.load()
      media.remove()
      if (waveSurferRef.current === waveSurfer) waveSurferRef.current = null
    }
  }, [hasAudio, isLoading, notifyPlaybackState, setOutputVolume, stopPauseFade, track.audioUrl, track.durationSeconds, track.id, updatePlaybackState])

  useEffect(() => {
    const previousTrack = previousTrackRef.current
    previousTrackRef.current = { audioUrl: track.audioUrl, id: track.id }
    if (previousTrack.id === track.id) return

    setCurrentTime(0)
    const nextDuration = waveSurferRef.current?.getDuration() || track.durationSeconds || 0
    setDuration(nextDuration)
    notifyPlaybackState({ currentTime: 0, duration: nextDuration, isPlaying: false })

    if (previousTrack.audioUrl === track.audioUrl && waveSurferRef.current && hasAudio) {
      setOutputVolume(volumeRef.current)
      waveSurferRef.current.setTime(0)
      waveSurferRef.current.play().catch(() => updatePlaybackState(false))
    }
  }, [hasAudio, notifyPlaybackState, setOutputVolume, track.audioUrl, track.durationSeconds, track.id, updatePlaybackState])

  const togglePlayback = useCallback(async () => {
    const waveSurfer = waveSurferRef.current
    if (!waveSurfer || !hasAudio) return

    try {
      if (pauseFadeRef.current.promise) {
        stopPauseFade(true, true)
        return
      }

      if (waveSurfer.isPlaying()) {
        await pauseWithFade()
        return
      }

      setOutputVolume(volumeRef.current)
      await waveSurfer.play()
    } catch {
      updatePlaybackState(false)
    }
  }, [hasAudio, pauseWithFade, setOutputVolume, stopPauseFade, updatePlaybackState])

  const playbackToggleNonceRef = useRef(playbackToggleNonce)

  useEffect(() => {
    if (playbackToggleNonceRef.current === playbackToggleNonce) return
    playbackToggleNonceRef.current = playbackToggleNonce

    const waveSurfer = waveSurferRef.current
    if (!waveSurfer || !hasAudio) return
    togglePlayback().catch(() => updatePlaybackState(false))
  }, [hasAudio, playbackToggleNonce, togglePlayback, updatePlaybackState])

  function seekTo(value) {
    const waveSurfer = waveSurferRef.current
    const mediaDuration = waveSurfer?.getDuration() || duration
    const safeEnd = mediaDuration > 0.1 ? mediaDuration - 0.05 : mediaDuration
    const nextTime = Math.min(Math.max(Number(value), 0), Math.max(safeEnd, 0))

    setCurrentTime(nextTime)
    waveSurfer?.setTime(nextTime)
    notifyPlaybackState({ currentTime: nextTime })
  }

  function handleWaveformKeyDown(event) {
    const step = event.shiftKey ? 10 : 5
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      seekTo(currentTime - step)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      seekTo(currentTime + step)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      seekTo(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      seekTo(duration)
    }
  }

  function changeVolume(nextVolume) {
    setVolume(nextVolume)
    volumeRef.current = nextVolume
    setOutputVolume(nextVolume)
    notifyPlaybackState({ volume: nextVolume })
  }

  const applyMiniPlayerControl = useEffectEvent((command) => {
    if (command.type === 'toggle') togglePlayback()
    if (command.type === 'seek') seekTo(command.time)
    if (command.type === 'volume') changeVolume(command.value)
  })

  useEffect(() => {
    let unlisten = () => {}
    let disposed = false

    listenToMiniPlayerCommands(applyMiniPlayerControl).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })

    return () => {
      disposed = true
      unlisten()
    }
  }, [])

  return (
    <aside
      className={`player-dock${collapsed ? ' player-dock--collapsed' : ''}${animationEnabled ? ' player-dock--animated' : ''}`}
      aria-label={`Reproductor de ${track.title}`}
    >
      <button
        className="player-dock__collapse"
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Desplegar reproductor' : 'Contraer reproductor'}
        title={collapsed ? 'Desplegar reproductor' : 'Contraer reproductor'}
        onClick={onToggleCollapsed}
      >
        <PlayerPanelToggleIcon collapsed={collapsed} />
      </button>
      {collapsed && !isLoading && (
        <div className="player-dock__compact">
          <img className="player-dock__compact-artwork" src={track.artwork} alt="" />
          <div className="player-dock__compact-copy">
            <strong title={track.title}>{track.title}</strong>
            <span title={track.artist}>{track.artist}</span>
          </div>
          <div className="player-dock__compact-transport">
            <button type="button" aria-label="Anterior" title="Anterior" onClick={onPrevious}>
              <SkipBack size={14} fill="currentColor" aria-hidden="true" />
            </button>
            <button
              className="player-dock__compact-play"
              type="button"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              title={hasAudio ? (isPlaying ? 'Pausar' : 'Reproducir') : 'Audio no disponible'}
              disabled={!hasAudio}
              onClick={togglePlayback}
            >
              {isPlaying
                ? <Pause size={14} fill="currentColor" aria-hidden="true" />
                : <Play size={14} fill="currentColor" aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Siguiente" title="Siguiente" onClick={onNext}>
              <SkipForward size={14} fill="currentColor" aria-hidden="true" />
            </button>
          </div>
          <div className="player-dock__compact-actions">
            <button
              className="player-dock__compact-mini"
              type="button"
              aria-label="Abrir mini reproductor"
              title="Abrir mini reproductor"
              onClick={onOpenMiniPlayer}
            >
              <ListMusic size={16} aria-hidden="true" />
            </button>
            <div className="player-dock__compact-volume">
              <VolumeControl
                expanded={volumeExpanded}
                onExpandedChange={setVolumeExpanded}
                onVolumeChange={changeVolume}
                volume={volume}
              />
            </div>
          </div>
        </div>
      )}
      <div className="player-dock__scroller">
      <div className="player-dock__header">
        <strong>{isLoading ? 'Descubrimiento semanal' : 'Reproduciendo ahora'}</strong>
        <div className="player-dock__header-actions">
          <button
            className="player-dock__close"
            type="button"
            aria-label="Cerrar reproductor"
            title="Cerrar reproductor"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <PlayerDiscoveryLoader />
      ) : (
        <>
          <div className="player-dock__track">
            <div className="player-dock__artwork">
              <span
                className="player-dock__artwork-backdrop"
                style={{ backgroundImage: `url(${track.artwork})` }}
                aria-hidden="true"
              />
              <img src={track.artwork} alt="" />
            </div>
            <div className="player-dock__details">
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </div>
            <div
              className="player-dock__favorite-wrap"
              aria-label="Añadir a favoritos"
              title="Añadir a favoritos"
            >
              <HeartToggle
                key={track.id}
                className="heart-container--player"
                label={`Me gusta ${track.title}`}
                liked={liked}
                onToggle={onToggleFavorite}
                removeLabel={`Quitar ${track.title} de favoritas`}
              />
            </div>
          </div>

          <div className="player-dock__center">
            <div className="player-dock__transport">
              <button type="button" aria-label="Anterior" title="Anterior" onClick={onPrevious}>
                <SkipBack size={19} fill="currentColor" aria-hidden="true" />
              </button>
              <button
                className="player-dock__play"
                type="button"
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                title={hasAudio ? (isPlaying ? 'Pausar' : 'Reproducir') : 'Audio no disponible'}
                disabled={!hasAudio}
                onClick={togglePlayback}
              >
                {isPlaying ? (
                  <Pause size={19} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={19} fill="currentColor" aria-hidden="true" />
                )}
              </button>
              <button type="button" aria-label="Siguiente" title="Siguiente" onClick={onNext}>
                <SkipForward size={19} fill="currentColor" aria-hidden="true" />
              </button>
            </div>

            <div className="waveform-timeline">
              <span>{formatTime(currentTime)}</span>
              <div
                className={`waveform-timeline__wave${hasAudio ? '' : ' waveform-timeline__wave--empty'}`}
                ref={waveformRef}
                role="slider"
                tabIndex={hasAudio ? 0 : -1}
                aria-label="Progreso de reproduccion"
                aria-valuemin="0"
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
                onKeyDown={handleWaveformKeyDown}
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-dock__actions">
            <button
              className="player-dock__action"
              type="button"
              aria-label="Abrir mini reproductor"
              title="Abrir mini reproductor"
              onClick={onOpenMiniPlayer}
            >
              <ListMusic size={17} aria-hidden="true" />
            </button>
            <div className="player-dock__volume">
              <VolumeControl
                expanded={volumeExpanded}
                onExpandedChange={setVolumeExpanded}
                onVolumeChange={changeVolume}
                volume={volume}
              />
            </div>
          </div>

          <section className="player-dock__queue" aria-labelledby="player-queue-title">
            <div className="player-dock__tabs" role="tablist" aria-label="Contenido del reproductor">
              <button className="player-dock__tab player-dock__tab--active" type="button" role="tab" aria-selected="true">
                Cola
              </button>
              <button className="player-dock__tab" type="button" role="tab" aria-selected="false">
                Artistas
              </button>
              <button className="player-dock__tab" type="button" role="tab" aria-selected="false">
                Favoritos
              </button>
            </div>
            <h2 id="player-queue-title" className="sr-only">Cola de reproduccion</h2>
            <div className="player-dock__queue-list">
              {queue.map((item) => (
                <button
                  className={`player-dock__queue-item${item.id === track.id ? ' player-dock__queue-item--active' : ''}`}
                  type="button"
                  key={item.id}
                  onClick={() => onQueueSelect(item.id)}
                >
                  <img src={item.artwork} alt="" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.artist}</small>
                  </span>
                  <time>{formatTime(item.durationSeconds)}</time>
                  <MoreVertical size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="player-dock__clear" type="button">
              Limpiar cola
            </button>
          </section>
        </>
      )}
      </div>
    </aside>
  )
}

export default PlayerDock
