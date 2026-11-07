import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { takePrimedAudio } from '../../features/auth/autoplayUnlock.js'
import { connectAudioAnalyser, disconnectAudioAnalyser } from '../../lib/audioAnalyser.js'
import { waveformOptions } from '../reproductor/waveformOptions.js'
import { createWaveformPeaks } from '../reproductor/utilidadesReproductor.js'
import useMediaSession from './useMediaSession.js'
import useMiniPlayerControls from './useMiniPlayerControls.js'
import useNextTrackPreload from './useNextTrackPreload.js'
import usePlaybackFades from './usePlaybackFades.js'
import useTrackChangeAnimation from './useTrackChangeAnimation.js'

// Motor del dock del catálogo propio: WaveSurfer + elemento de audio, estado de reproducción y
// volumen. Lo accesorio vive en hooks hermanos (fundidos, Media Session, mini reproductor, precarga,
// animación de cambio de pista). El orden de las llamadas a hooks es el mismo que tenía el archivo
// único, porque el orden de los efectos importa.

export default
function useAudioPlayerDock({ animationNonce, autoPlay = true, collapsed = false, fadeInNonce = 0, isLoading = false, onAnalyserChange, onNext, onPlaybackChange, onPlaybackStateChange, onPrevious, playbackToggleNonce, queue, track }) {
  const waveformRef = useRef(null)
  const waveSurferRef = useRef(null)
  const previousTrackRef = useRef({ audioUrl: track.audioUrl, id: track.id })
  const trackDurationRef = useRef(track.durationSeconds ?? 0)
  const volumeRef = useRef(75)
  const fadeInFrameRef = useRef(null)
  const fadeInNonceRef = useRef(0)
  const fadeInPendingRef = useRef(false)
  const pauseFadeRef = useRef({ frameId: null, resolve: null, promise: null, waveSurfer: null })
  const preloadedAudioRef = useRef(null)
  const onPlaybackChangeRef = useRef(onPlaybackChange)
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const onNextRef = useRef(onNext)
  const hasNextTrackRef = useRef(queue.length > 1)
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
    hasNextTrackRef.current = queue.length > 1
  }, [queue])

  const setOutputVolume = useCallback((nextVolume) => {
    const normalizedVolume = Math.min(Math.max(nextVolume / 100, 0), 1)
    waveSurferRef.current?.setVolume(normalizedVolume)
  }, [])


  const { pauseWithFade, startFadeIn, stopPauseFade } = usePlaybackFades({ fadeInFrameRef, hasAudio, notifyPlaybackState, pauseFadeRef, setCurrentTime, setOutputVolume, updatePlaybackState, volumeRef, waveSurferRef })

  const trackChangeAnimationEnabled = useTrackChangeAnimation(animationNonce)

  useEffect(() => {
    const container = waveformRef.current
    if (!container || !hasAudio) return undefined

    const normalizedAudioUrl = new URL(track.audioUrl, window.location.href).href
    const preloadedAudio = preloadedAudioRef.current?.url === normalizedAudioUrl
      ? preloadedAudioRef.current.audio
      : null
    if (preloadedAudio) preloadedAudioRef.current = null

    const media = preloadedAudio ?? takePrimedAudio(track.audioUrl) ?? new Audio()
    media.crossOrigin = 'anonymous'
    if (media.src !== normalizedAudioUrl) media.src = track.audioUrl
    media.preload = 'auto'
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


    // La duración se lee de una ref (se actualiza antes en el mismo commit) en vez de ser dependencia
    // del efecto: si el catálogo la completa después, no debe recrearse el audio ni WaveSurfer
    // a mitad de reproducción. El evento 'ready' ya informa la duración real.
    const knownDuration = trackDurationRef.current
    const mediaDuration = Number.isFinite(knownDuration) && knownDuration > 0 ? knownDuration : 1

    const waveSurfer = WaveSurfer.create({
      ...waveformOptions,
      container,
      media,
      peaks: [createWaveformPeaks(track.id)],
      duration: mediaDuration,
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
        if (!autoPlay) {
          fadeInPendingRef.current = false
          setOutputVolume(volumeRef.current)
          updatePlaybackState(false)
          return
        }
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
  }, [autoPlay, fadeInNonce, hasAudio, isLoading, notifyPlaybackState, setOutputVolume, startFadeIn, stopPauseFade, track.audioUrl, track.id, updatePlaybackState])

  useNextTrackPreload({ preloadedAudioRef, queue, track })

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

  useMediaSession({ currentTime, duration, isPlaying, onNext, onPrevious, pauseWithFade, playbackStateRef, seekTo, setOutputVolume, track, updatePlaybackState, volumeRef, waveSurferRef })

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

  useMiniPlayerControls({ changeVolume, seekTo, togglePlayback })

  const mobileProgress = duration > 0
    ? `${Math.min(Math.max((currentTime / duration) * 100, 0), 100)}%`
    : '0%'
  const playerStyle = {
    '--mobile-player-progress': mobileProgress,
    ...(collapsed && track.artwork ? { '--compact-artwork': `url(${track.artwork})` } : {}),
  }

  return {
    analyser,
    changeVolume,
    currentTime,
    duration,
    handleWaveformKeyDown,
    hasAudio,
    isPlaying,
    playerStyle,
    seekTo,
    setVolumeExpanded,
    togglePlayback,
    trackChangeAnimationEnabled,
    volume,
    volumeExpanded,
    waveformRef,
  }
}
