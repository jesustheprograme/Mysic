import {
  ListMusic,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { takePrimedAudio } from '../features/auth/autoplayUnlock.js'
import { listenToMiniPlayerCommands } from '../features/mini-player/playerBridge.ts'
import { connectAudioAnalyser, disconnectAudioAnalyser } from '../lib/audioAnalyser.js'
import HeartToggle from './HeartToggle.jsx'
import {
  CompactNowPlaying,
  PlayerDiscoveryLoader,
  PlayerPanelContent,
  PlayerPanelToggleIcon,
  PlayerQueue,
  VolumeControl,
} from './reproductor/ControlesReproductor.jsx'
import {
  createWaveformPeaks,
  formatTime,
  getMediaSessionArtwork,
  setMediaSessionAction,
} from './reproductor/utilidadesReproductor.js'

function ControlledPlayerDock({ collapsed = false, externalPlayback, liked = false, onClose, onNext, onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, queue, track }) {
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const {
    commitSeek,
    currentIndex,
    currentTime,
    duration,
    error,
    handleSeek,
    isBuffering,
    isPlaying,
    setVolume,
    togglePlayback,
    volume,
  } = externalPlayback
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0
  const waveformPeaks = useMemo(() => createWaveformPeaks(track.id), [track.id])
  const playerStyle = {
    '--mobile-player-progress': `${progress}%`,
    ...(collapsed && track.artwork ? { '--compact-artwork': `url(${track.artwork})` } : {}),
  }

  return (
    <aside
      className={`player-dock player-dock--animated${collapsed ? ' player-dock--collapsed' : ''}`}
      aria-label={`Reproductor de ${track.title}`}
      style={playerStyle}
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
      {collapsed && (
        <div className="player-dock__compact">
          <CompactNowPlaying
            analyser={null}
            currentTime={currentTime}
            duration={duration}
            hasAudio
            isPlaying={isPlaying}
            onExpand={onToggleCollapsed}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={togglePlayback}
            track={track}
          />
        </div>
      )}
      <div className="player-dock__scroller">
        <div className="player-dock__header">
          <strong>Reproduciendo ahora</strong>
          <div className="player-dock__header-actions">
            <button className="player-dock__close" type="button" aria-label="Cerrar reproductor" title="Cerrar reproductor" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <PlayerPanelContent
          artwork={track.artwork}
          artist={track.artist}
          currentTime={currentTime}
          duration={duration}
          error={error}
          hasAudio
          isBuffering={isBuffering}
          isPlaying={isPlaying}
          onNext={onNext}
          onPrevious={onPrevious}
          onTogglePlayback={togglePlayback}
          progress={(
            <div className="waveform-timeline__wave player-dock__controlled-wave">
              <div aria-hidden="true">
                {waveformPeaks.map((peak, index) => (
                  <i
                    className={(index / waveformPeaks.length) * 100 <= progress ? 'is-elapsed' : undefined}
                    key={index}
                    style={{ '--wave-height': `${Math.round(peak * 100)}%` }}
                  />
                ))}
              </div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                disabled={!duration}
                aria-label="Progreso de reproducción"
                onChange={handleSeek}
                onMouseUp={commitSeek}
                onTouchEnd={commitSeek}
                onKeyUp={commitSeek}
              />
            </div>
          )}
          title={track.title}
          trackAction={(
            <div className="player-dock__favorite-wrap">
              <HeartToggle
                key={track.id}
                className="heart-container--player"
                portalCelebration
                label={`Me gusta ${track.title}`}
                liked={liked}
                onToggle={onToggleFavorite}
                removeLabel={`Quitar ${track.title} de favoritas`}
              />
            </div>
          )}
        />

        <div className="player-dock__actions">
          <span />
          <div className="player-dock__volume">
            <VolumeControl
              expanded={volumeExpanded}
              onExpandedChange={setVolumeExpanded}
              onVolumeChange={(nextVolume) => setVolume(nextVolume / 100)}
              volume={Math.round(volume * 100)}
            />
          </div>
        </div>

        <PlayerQueue
          activeIndex={currentIndex}
          onQueueSelect={(_item, index) => onQueueSelect(index)}
          queue={queue}
        />
      </div>
    </aside>
  )
}

function AudioPlayerDock({ animationNonce, collapsed = false, fadeInNonce = 0, isLoading = false, liked = false, onAnalyserChange, onClose, onNext, onOpenMiniPlayer, onPlaybackChange, onPlaybackStateChange, onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, playbackToggleNonce, queue, suppressed = false, track }) {
  const PAUSE_FADE_DURATION_MS = 400
  const START_FADE_DURATION_MS = 1200
  const waveformRef = useRef(null)
  const waveSurferRef = useRef(null)
  const hasMountedRef = useRef(false)
  const previousTrackRef = useRef({ audioUrl: track.audioUrl, id: track.id })
  const trackDurationRef = useRef(track.durationSeconds ?? 0)
  const volumeRef = useRef(75)
  const fadeInFrameRef = useRef(null)
  const fadeInNonceRef = useRef(0)
  const fadeInPendingRef = useRef(false)
  const pauseFadeRef = useRef({ frameId: null, resolve: null, promise: null, waveSurfer: null })
  const onPlaybackChangeRef = useRef(onPlaybackChange)
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const onNextRef = useRef(onNext)
  const hasNextTrackRef = useRef(Boolean(queue[0]?.audioUrl))
  const lastProgressUpdateRef = useRef(0)
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
  const [trackChangeAnimationEnabled, setTrackChangeAnimationEnabled] = useState(false)
  const [analyser, setAnalyser] = useState(null)
  const hasAudio = Boolean(track.audioUrl)
  const notifyAnalyserChange = useEffectEvent((nextAnalyser) => onAnalyserChange?.(nextAnalyser))

  const notifyPlaybackState = useCallback((patch) => {
    const nextPlaybackState = { ...playbackStateRef.current, ...patch }
    playbackStateRef.current = nextPlaybackState
    onPlaybackStateChangeRef.current?.(nextPlaybackState)
  }, [])

  const updatePlaybackState = useCallback((nextIsPlaying) => {
    setIsPlaying(nextIsPlaying)
    onPlaybackChangeRef.current(nextIsPlaying)
    notifyPlaybackState({ isPlaying: nextIsPlaying })
  }, [notifyPlaybackState])

  useEffect(() => {
    trackDurationRef.current = track.durationSeconds ?? 0
  }, [track.durationSeconds])

  useEffect(() => {
    onPlaybackChangeRef.current = onPlaybackChange
  }, [onPlaybackChange])

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange
  }, [onPlaybackStateChange])

  useEffect(() => {
    onNextRef.current = onNext
  }, [onNext])

  useEffect(() => {
    hasNextTrackRef.current = Boolean(queue[0]?.audioUrl)
  }, [queue])

  const setOutputVolume = useCallback((nextVolume) => {
    const normalizedVolume = Math.min(Math.max(nextVolume / 100, 0), 1)
    waveSurferRef.current?.setVolume(normalizedVolume)
  }, [])


  const startFadeIn = useCallback((waveSurfer) => {
    if (fadeInFrameRef.current !== null) cancelAnimationFrame(fadeInFrameRef.current)

    const targetVolume = volumeRef.current / 100
    const startedAt = performance.now()
    const step = (frameTime) => {
      if (waveSurferRef.current !== waveSurfer) return

      const progress = Math.min((frameTime - startedAt) / START_FADE_DURATION_MS, 1)
      const easedProgress = 1 - ((1 - progress) ** 2)
      waveSurfer.setVolume(targetVolume * easedProgress)

      if (progress < 1) {
        fadeInFrameRef.current = requestAnimationFrame(step)
        return
      }

      fadeInFrameRef.current = null
    }

    fadeInFrameRef.current = requestAnimationFrame(step)
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

    setTrackChangeAnimationEnabled(false)
    const frameId = requestAnimationFrame(() => setTrackChangeAnimationEnabled(true))
    return () => cancelAnimationFrame(frameId)
  }, [animationNonce])

  useEffect(() => {
    const container = waveformRef.current
    if (!container || !hasAudio) return undefined

    const media = takePrimedAudio(track.audioUrl) ?? new Audio()
    media.crossOrigin = 'anonymous'
    if (media.getAttribute('src') !== track.audioUrl) media.src = track.audioUrl
    media.preload = 'metadata'
    media.hidden = true
    media.muted = false
    media.setAttribute('aria-hidden', 'true')
    container.appendChild(media)

    let trackAnalyser = null
    try {
      trackAnalyser = connectAudioAnalyser(media)
      setAnalyser(trackAnalyser)
      notifyAnalyserChange(trackAnalyser)
    } catch {
      setAnalyser(null)
      notifyAnalyserChange(null)
    }


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
    })

    waveSurferRef.current = waveSurfer
    waveSurfer.setVolume(volumeRef.current / 100)
    let renderedWidth = Math.round(container.getBoundingClientRect().width)
    const waveformResizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width)
      if (nextWidth <= 0 || nextWidth === renderedWidth) return
      renderedWidth = nextWidth
      waveSurfer.setOptions({ width: nextWidth })
    })
    waveformResizeObserver.observe(container)
    const shouldFadeIn = fadeInNonce !== fadeInNonceRef.current
    fadeInNonceRef.current = fadeInNonce
    fadeInPendingRef.current = shouldFadeIn
    if (shouldFadeIn) waveSurfer.setVolume(0)

    const cleanups = [
      waveSurfer.on('ready', (readyDuration) => {
        const nextDuration = readyDuration || trackDurationRef.current || 0
        setDuration(nextDuration)
        setCurrentTime(0)
        notifyPlaybackState({ currentTime: 0, duration: nextDuration })
        waveSurfer.play().then(() => {
          fadeInPendingRef.current = false
          if (shouldFadeIn) startFadeIn(waveSurfer)
        }).catch(() => {
          fadeInPendingRef.current = false
          setOutputVolume(volumeRef.current)
          updatePlaybackState(false)
        })
      }),
      waveSurfer.on('play', () => {
        if (!pauseFadeRef.current.promise && !fadeInPendingRef.current && fadeInFrameRef.current === null) {
          setOutputVolume(volumeRef.current)
        }
        updatePlaybackState(true)
      }),
      waveSurfer.on('pause', () => updatePlaybackState(false)),
      waveSurfer.on('timeupdate', (time) => {
        if (pauseFadeRef.current.promise) return
        const now = performance.now()
        if (now - lastProgressUpdateRef.current < 200) return
        lastProgressUpdateRef.current = now
        setCurrentTime(time)
        notifyPlaybackState({ currentTime: time })
      }),
      waveSurfer.on('finish', () => {
        const finishedAt = waveSurfer.getDuration()
        setCurrentTime(finishedAt)
        notifyPlaybackState({ currentTime: finishedAt })
        updatePlaybackState(false)
        if (hasNextTrackRef.current) onNextRef.current?.()
      }),
      waveSurfer.on('error', () => updatePlaybackState(false)),
    ]

    return () => {
      if (fadeInFrameRef.current !== null) cancelAnimationFrame(fadeInFrameRef.current)
      if (trackAnalyser) disconnectAudioAnalyser(media)
      setAnalyser((currentAnalyser) => currentAnalyser === trackAnalyser ? null : currentAnalyser)
      notifyAnalyserChange(null)
      fadeInFrameRef.current = null
      fadeInPendingRef.current = false
      stopPauseFade(false)
      waveformResizeObserver.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      waveSurfer.destroy()
      media.pause()
      media.removeAttribute('src')
      media.load()
      media.remove()
      if (waveSurferRef.current === waveSurfer) waveSurferRef.current = null
    }
  }, [fadeInNonce, hasAudio, isLoading, notifyPlaybackState, setOutputVolume, startFadeIn, stopPauseFade, track.audioUrl, track.durationSeconds, track.id, updatePlaybackState])

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

  const seekTo = useCallback((value) => {
    const waveSurfer = waveSurferRef.current
    const mediaDuration = waveSurfer?.getDuration() || duration
    const safeEnd = mediaDuration > 0.1 ? mediaDuration - 0.05 : mediaDuration
    const nextTime = Math.min(Math.max(Number(value), 0), Math.max(safeEnd, 0))

    setCurrentTime(nextTime)
    waveSurfer?.setTime(nextTime)
    notifyPlaybackState({ currentTime: nextTime })
  }, [duration, notifyPlaybackState])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return undefined

    navigator.mediaSession.metadata = new window.MediaMetadata({
      album: track.albumTitle ?? track.album?.title ?? '',
      artist: track.artist ?? '',
      artwork: getMediaSessionArtwork(track.artwork ?? track.album?.artwork),
      title: track.title ?? 'Sin título',
    })

    return () => {
      navigator.mediaSession.metadata = null
    }
  }, [track.album?.artwork, track.album?.title, track.albumTitle, track.artist, track.artwork, track.title])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined

    const play = () => {
      const waveSurfer = waveSurferRef.current
      if (!waveSurfer || waveSurfer.isPlaying()) return
      setOutputVolume(volumeRef.current)
      waveSurfer.play().catch(() => updatePlaybackState(false))
    }
    const pause = () => {
      if (waveSurferRef.current?.isPlaying()) pauseWithFade()
    }
    const seekBy = (seconds) => seekTo(playbackStateRef.current.currentTime + seconds)

    setMediaSessionAction('play', play)
    setMediaSessionAction('pause', pause)
    setMediaSessionAction('stop', pause)
    setMediaSessionAction('previoustrack', onPrevious)
    setMediaSessionAction('nexttrack', onNext)
    setMediaSessionAction('seekbackward', ({ seekOffset = 10 }) => seekBy(-seekOffset))
    setMediaSessionAction('seekforward', ({ seekOffset = 10 }) => seekBy(seekOffset))
    setMediaSessionAction('seekto', ({ seekTime }) => {
      if (Number.isFinite(seekTime)) seekTo(seekTime)
    })

    return () => {
      ;['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto']
        .forEach((action) => setMediaSessionAction(action, null))
    }
  }, [onNext, onPrevious, pauseWithFade, seekTo, setOutputVolume, updatePlaybackState])

  const mediaSessionPosition = Math.floor(currentTime)

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    if (!Number.isFinite(duration) || duration <= 0) return

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(mediaSessionPosition, 0), duration),
      })
    } catch {
      // La duración real puede tardar un instante en estar disponible.
    }
  }, [duration, isPlaying, mediaSessionPosition])

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

  const mobileProgress = duration > 0
    ? `${Math.min(Math.max((currentTime / duration) * 100, 0), 100)}%`
    : '0%'
  const playerStyle = {
    '--mobile-player-progress': mobileProgress,
    ...(collapsed && track.artwork ? { '--compact-artwork': `url(${track.artwork})` } : {}),
  }

  return (
    <aside
      className={`player-dock player-dock--animated${collapsed ? ' player-dock--collapsed' : ''}${trackChangeAnimationEnabled ? ' player-dock--track-changing' : ''}${suppressed ? ' player-dock--suppressed' : ''}`}
      aria-label={`Reproductor de ${track.title}`}
      aria-hidden={suppressed || undefined}
      inert={suppressed || undefined}
      style={playerStyle}
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
          <CompactNowPlaying
            analyser={analyser}
            currentTime={currentTime}
            duration={duration}
            hasAudio={hasAudio}
            isPlaying={isPlaying}
            onExpand={onToggleCollapsed}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={togglePlayback}
            track={track}
          />
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
          <PlayerPanelContent
            artwork={track.artwork}
            artist={track.artist}
            currentTime={currentTime}
            duration={duration}
            hasAudio={hasAudio}
            isPlaying={isPlaying}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={togglePlayback}
            progress={(
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
            )}
            title={track.title}
            trackAction={(
              <div
                className="player-dock__favorite-wrap"
                aria-label="Añadir a favoritos"
                title="Añadir a favoritos"
              >
                <HeartToggle
                  key={track.id}
                  className="heart-container--player"
                  portalCelebration
                  label={`Me gusta ${track.title}`}
                  liked={liked}
                  onToggle={onToggleFavorite}
                  removeLabel={`Quitar ${track.title} de favoritas`}
                />
              </div>
            )}
          />

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

          <PlayerQueue
            activeTrackId={track.id}
            onQueueSelect={(item) => onQueueSelect(item.id)}
            queue={queue}
          />
        </>
      )}
      </div>
    </aside>
  )
}

function PlayerDock(props) {
  if (props.externalPlayback) return <ControlledPlayerDock {...props} />
  return <AudioPlayerDock {...props} />
}

export default PlayerDock
