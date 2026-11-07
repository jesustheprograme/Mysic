import { useCallback } from 'react'

const PAUSE_FADE_DURATION_MS = 400
const START_FADE_DURATION_MS = 1200

/**
 * Fundidos de volumen: entrada al empezar una pista y salida al pausar. Los refs (adeInFrameRef,
 * pauseFadeRef) son del hook principal porque el efecto de WaveSurfer también los lee y limpia.
 */
export default function usePlaybackFades({ fadeInFrameRef, hasAudio, notifyPlaybackState, pauseFadeRef, setCurrentTime, setOutputVolume, updatePlaybackState, volumeRef, waveSurferRef }) {
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
  }, [fadeInFrameRef, volumeRef, waveSurferRef])

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
  }, [notifyPlaybackState, pauseFadeRef, setCurrentTime, setOutputVolume, updatePlaybackState, volumeRef])

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
  }, [hasAudio, notifyPlaybackState, pauseFadeRef, setCurrentTime, setOutputVolume, updatePlaybackState, volumeRef, waveSurferRef])
  return { pauseWithFade, startFadeIn, stopPauseFade }
}
