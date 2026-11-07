import { useEffect } from 'react'
import { getMediaSessionArtwork, setMediaSessionAction } from '../reproductor/utilidadesReproductor.js'

/** Integra el reproductor con los controles multimedia del sistema (metadatos, acciones y posición). */
export default function useMediaSession({ currentTime, duration, isPlaying, onNext, onPrevious, pauseWithFade, playbackStateRef, seekTo, setOutputVolume, track, updatePlaybackState, volumeRef, waveSurferRef }) {
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
  }, [onNext, onPrevious, pauseWithFade, playbackStateRef, seekTo, setOutputVolume, updatePlaybackState, volumeRef, waveSurferRef])

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
}
