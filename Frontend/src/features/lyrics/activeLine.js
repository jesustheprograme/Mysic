/**
 * Índice de la última línea cuyo tiempo ya pasó, o -1 si aún no empieza la letra.
 * Búsqueda binaria: se llama en cada actualización de progreso del reproductor.
 */
export function findActiveLineIndex(lines, time) {
  if (!Array.isArray(lines) || lines.length === 0 || !Number.isFinite(time)) return -1

  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].time <= time) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/** Duración útil para emparejar la letra: la del catálogo si existe, si no la del reproductor. */
export function lyricsDuration(trackDuration, playerDuration) {
  const candidate = Number(trackDuration) > 0 ? Number(trackDuration) : Number(playerDuration)
  return Number.isFinite(candidate) && candidate > 0 ? Math.round(candidate) : 0
}
