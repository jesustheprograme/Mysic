// Respaldo del reproductor: si YouTube no permite incrustar un vídeo (error 101/150 del reproductor, o 5 si el
// reproductor HTML5 falla), se reproduce su audio por la ruta de streaming del servidor (/youtube/stream/:id).
// Lógica pura y almacenamiento: el hook usePlayer (generado) solo la consume.
const STORAGE_KEY = 'mysic:youtube:embed-blocked'
const MAX_REMEMBERED = 300

// 101 y 150: el propietario no permite reproducirlo fuera de YouTube. 5: fallo del reproductor HTML5.
const FALLBACK_ERROR_CODES = new Set([101, 150, 5])

/** ¿Este código de error del reproductor incrustado justifica pasar al audio por el servidor? */
export const shouldFallbackToStream = (code) => FALLBACK_ERROR_CODES.has(Number(code))

/** Añade un id (el más reciente al final) y recorta a los últimos 300. Devuelve el mismo array si ya estaba. */
export function rememberBlockedId(ids, id) {
  if (!id || ids.includes(id)) return ids
  const next = [...ids, id]
  return next.length > MAX_REMEMBERED ? next.slice(next.length - MAX_REMEMBERED) : next
}

export function readBlockedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(-MAX_REMEMBERED) : []
  } catch {
    return []
  }
}

export function writeBlockedIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Sin almacenamiento: el respaldo sigue funcionando durante la sesión.
  }
}