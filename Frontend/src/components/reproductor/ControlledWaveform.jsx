import { useEffect, useEffectEvent, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { createWaveformPeaks, formatTime } from './utilidadesReproductor.js'
import { waveformOptions } from './waveformOptions.js'

// Render the same Mysic waveform without loading or playing a second audio source.
export default function ControlledWaveform({ trackId, currentTime, duration, onSeek }) {
  const containerRef = useRef(null)
  const waveRef = useRef(null)
  const seek = useEffectEvent((time) => onSeek(time))

  useEffect(() => {
    if (!(duration > 0)) return undefined
    const wave = WaveSurfer.create({
      ...waveformOptions,
      container: containerRef.current,
      peaks: [createWaveformPeaks(trackId)],
      duration,
    })
    waveRef.current = wave
    const unsubscribe = wave.on('interaction', (time) => seek(time))
    return () => {
      unsubscribe()
      waveRef.current = null
      wave.destroy()
    }
  }, [trackId, duration])

  useEffect(() => {
    waveRef.current?.setTime(Math.min(currentTime, duration))
  }, [currentTime, duration])

  function onKeyDown(event) {
    const times = { ArrowLeft: currentTime - 5, ArrowRight: currentTime + 5, Home: 0, End: duration }
    if (!(event.key in times) || !duration) return
    event.preventDefault()
    onSeek(Math.max(0, Math.min(duration, times[event.key])))
  }

  return <div ref={containerRef} className="waveform-timeline__wave" role="slider"
    tabIndex={duration > 0 ? 0 : -1} aria-label="Progreso de reproducción"
    aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime}
    aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
    onKeyDown={onKeyDown} />
}
