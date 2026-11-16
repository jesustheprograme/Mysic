import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createWaveformPeaks, formatTime } from './utilidadesReproductor.js'
import { waveformOptions } from './waveformOptions.js'
import { barCount, keySeekTime, playedBars, playedFraction, resamplePeaks, timeAtPosition } from './waveformModel.js'

const SEEK_THROTTLE_MS = 30

// Barra de progreso con forma de onda del reproductor controlado (YouTube): el audio lo gestiona usePlayer, esto solo
// lo pinta y atiende los saltos. Es un <canvas> con unas 100 barras (no una librería de ondas): se dibuja una vez por
// cambio de tamaño o de progreso, sin leer el layout ni recrear nada al cambiar de pista o de duración.
export default function ControlledWaveform({ trackId, currentTime, duration, onSeek }) {
  const boxRef = useRef(null)
  const canvasRef = useRef(null)
  const sizeRef = useRef({ height: 0, width: 0 })
  const draggingRef = useRef(false)
  const lastSeekRef = useRef(0)
  const peaks = useMemo(() => createWaveformPeaks(trackId), [trackId])
  const fraction = playedFraction(currentTime, duration)
  // Lo último que recibió el componente, para que dibujar y saltar no dependan de cuántas veces cambie cada cosa.
  const latest = useRef({ duration, onSeek, peaks })
  useEffect(() => {
    latest.current = { duration, onSeek, peaks }
  })
  const seek = (time) => latest.current.onSeek(time)

  const draw = useCallback((progress) => {
    const { peaks: currentPeaks } = latest.current
    const canvas = canvasRef.current
    const { height, width } = sizeRef.current
    const context = canvas?.getContext('2d')
    if (!context || !width || !height) return
    const { barGap, barRadius, barWidth, progressColor, waveColor } = waveformOptions
    const count = barCount(width, barWidth, barGap)
    const bars = resamplePeaks(currentPeaks, count)
    const played = playedBars(count, progress)
    context.clearRect(0, 0, canvas.width, canvas.height)
    const ratio = canvas.width / width
    context.save()
    context.scale(ratio, ratio)
    bars.forEach((value, index) => {
      const barHeight = Math.max(2, value * height)
      context.fillStyle = index < played ? progressColor : waveColor
      context.beginPath()
      if (context.roundRect) context.roundRect(index * (barWidth + barGap), (height - barHeight) / 2, barWidth, barHeight, barRadius)
      else context.rect(index * (barWidth + barGap), (height - barHeight) / 2, barWidth, barHeight)
      context.fill()
    })
    context.restore()
  }, [])

  // Tamaño: solo cuando cambia (ResizeObserver entrega las medidas sin forzar el layout).
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { height, width } = entry.contentRect
      const density = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { height, width }
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      draw(fraction)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [draw, fraction])

  useEffect(() => {
    draw(fraction)
  }, [draw, fraction, peaks])

  function seekFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const time = timeAtPosition(event.clientX - rect.left, rect.width, latest.current.duration)
    draw(playedFraction(time, latest.current.duration))
    seek(time)
  }

  function onPointerDown(event) {
    if (!(duration > 0)) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    lastSeekRef.current = performance.now()
    seekFromPointer(event)
  }

  function onPointerMove(event) {
    if (!draggingRef.current) return
    const now = performance.now()
    if (now - lastSeekRef.current < SEEK_THROTTLE_MS) return
    lastSeekRef.current = now
    seekFromPointer(event)
  }

  function onPointerUp(event) {
    if (!draggingRef.current) return
    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    seekFromPointer(event)
  }

  function onKeyDown(event) {
    const time = keySeekTime(event.key, currentTime, duration)
    if (time === null) return
    event.preventDefault()
    seek(time)
  }

  return (
    <div
      aria-label="Progreso de reproducción"
      aria-valuemax={duration > 0 ? duration : 0}
      aria-valuemin={0}
      aria-valuenow={currentTime}
      aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
      className="waveform-timeline__wave player-dock__controlled-wave"
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={boxRef}
      role="slider"
      tabIndex={duration > 0 ? 0 : -1}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
