// Fundido de entrada y salida de cada canción: el volumen sube de 0 al nivel elegido en el primer segundo y baja a 0
// en el último. Al pasar a la siguiente no hay corte seco.

export const FADE_SECONDS = 1;
export const FADE_MS = FADE_SECONDS * 1000;

/**
 * Pausa con fundido (la misma curva que ya usaba el reproductor del catálogo propio): factor 1 → 0 en `FADE_MS`, que
 * cae deprisa al principio y se apaga suave. Reanudar no tiene fundido.
 */
export function pauseFadeGain(elapsedMs, durationMs = FADE_MS) {
  if (!(durationMs > 0)) return 0;
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return (1 - progress) ** 2;
}

/**
 * Factor (0..1) que multiplica el volumen elegido en la posición `time` de una canción de `duration` segundos.
 * Sin duración conocida (stream sin longitud) solo hay fundido de entrada. En canciones de menos de dos fundidos,
 * las dos rampas se cruzan y gana la menor.
 */
export function fadeGain(time, duration, fade = FADE_SECONDS) {
  if (!(fade > 0) || !Number.isFinite(time) || time < 0) return 1;
  const fadeIn = Math.min(1, time / fade);
  const fadeOut = Number.isFinite(duration) && duration > 0 ? Math.min(1, Math.max(0, duration - time) / fade) : 1;
  return Math.max(0, Math.min(fadeIn, fadeOut));
}
