// Barra de progreso con forma de onda del reproductor de YouTube: lógica pura (sin DOM).
//
// Los picos son sintéticos (se generan del id de la canción, no se analiza el audio), así que no hace falta una
// librería de ondas: basta dibujar unas barras en un <canvas>. WaveSurfer recreaba su renderizador en cada cambio de
// pista y de duración y leía el layout (getHeight) de una página de miles de nodos: dos tareas de ~100 ms justo
// cuando el navegador debía arrancar el audio.

/** Número de barras que caben en `width` px (ancho de barra + hueco). Al menos 1 si hay algo de ancho. */
export function barCount(width, barWidth = 2, gap = 1) {
  if (!(width > 0)) return 0
  return Math.max(1, Math.floor((width + gap) / (barWidth + gap)))
}

/** Alturas (0..1) de `count` barras tomando muestras de `peaks` (remuestreo por índice). */
export function resamplePeaks(peaks, count) {
  if (!(count > 0) || !peaks?.length) return []
  return Array.from({ length: count }, (_, index) => peaks[Math.min(peaks.length - 1, Math.floor((index * peaks.length) / count))])
}

/** Fracción reproducida (0..1); 0 sin duración conocida y acotada si el tiempo se pasa. */
export function playedFraction(currentTime, duration) {
  if (!(duration > 0) || !(currentTime > 0)) return 0
  return Math.min(1, currentTime / duration)
}

/** Cuántas barras (desde la izquierda) están ya reproducidas. */
export function playedBars(count, fraction) {
  return Math.max(0, Math.min(count, Math.round(count * fraction)))
}

/** Tiempo (s) al que apunta una posición horizontal `x` dentro de una barra de `width` px, acotado a la duración. */
export function timeAtPosition(x, width, duration) {
  if (!(width > 0) || !(duration > 0)) return 0
  return Math.max(0, Math.min(1, x / width)) * duration
}

/** Teclas de salto de la barra: ±5 s, inicio y fin. null si la tecla no es de salto. */
export function keySeekTime(key, currentTime, duration) {
  if (!(duration > 0)) return null
  const targets = { ArrowLeft: currentTime - 5, ArrowRight: currentTime + 5, Home: 0, End: duration }
  return Object.hasOwn(targets, key) ? Math.max(0, Math.min(duration, targets[key])) : null
}
