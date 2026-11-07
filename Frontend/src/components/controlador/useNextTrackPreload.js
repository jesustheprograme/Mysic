import { useEffect } from 'react'

/** Precarga el audio de la siguiente pista de la cola (solo catálogo propio; YouTube usa su propio reproductor). */
export default function useNextTrackPreload({ preloadedAudioRef, queue, track }) {
  const currentTrackIndex = queue.findIndex((item) => (
    item.id === track.id && (item.source === 'youtube') === (track.source === 'youtube')
  ))
  const nextTrack = currentTrackIndex >= 0 && queue.length > 1
    ? queue[(currentTrackIndex + 1) % queue.length]
    : null
  const nextAudioUrl = nextTrack?.source === 'youtube' ? null : nextTrack?.audioUrl

  useEffect(() => {
    if (!nextAudioUrl) return undefined

    const normalizedAudioUrl = new URL(nextAudioUrl, window.location.href).href
    if (preloadedAudioRef.current?.url === normalizedAudioUrl) return undefined

    const media = new Audio()
    media.crossOrigin = 'anonymous'
    media.preload = 'auto'
    media.src = nextAudioUrl
    media.load()
    preloadedAudioRef.current = { audio: media, url: normalizedAudioUrl }

    return () => {
      if (preloadedAudioRef.current?.audio !== media) return
      preloadedAudioRef.current = null
      media.removeAttribute('src')
      media.load()
    }
  }, [nextAudioUrl, preloadedAudioRef])
}
