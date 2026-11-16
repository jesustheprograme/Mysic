import { LIKED_ID, REPEAT_ID, thumb } from './libraryModel.js'

/** Cuántos accesos directos caben en el inicio (dos filas de tres o cuatro columnas). */
export const QUICK_ACCESS_LIMIT = 8

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
const isYoutubeLikedList = (playlist) => /^(VL)?LM$/.test(playlist.id)
const QUICK_THUMB_PX = 96

/**
 * Accesos directos del inicio: "En repetición" (solo si hay canciones), "Música que me gusta", los accesos que el
 * usuario fijó a mano (`pinned`, salen con `pinned: true`) y por último sus playlists y álbumes más recientes, sin
 * repetir. Cada entrada: { id, kind, title, subtitle, thumbnail, icon?, pinned? }.
 */
/** Con muchos accesos fijados a mano la sección crece hasta este tope (los automáticos nunca pasan de QUICK_ACCESS_LIMIT). */
export const QUICK_ACCESS_MAX = 18

/** Mueve `from` al sitio de `to` dentro de la lista de claves (arrastrar una tarjeta sobre otra). Función pura. */
export function moveKey(keys, from, to) {
  const start = keys.indexOf(from)
  const end = keys.indexOf(to)
  if (start < 0 || end < 0 || start === end) return keys
  const next = keys.filter((key) => key !== from)
  next.splice(end, 0, from)
  return next
}

export function buildQuickAccess(data, { hidden = [], limit = QUICK_ACCESS_LIMIT, order = [], pinned = [], repeat = [] } = {}) {
  const likedSongs = data?.likedSongs ?? []
  const entries = []
  const seen = new Set(hidden) // lo quitado con la "x" no vuelve a entrar (los fijados a mano lo sacan de aquí al fijarse)
  const push = (entry) => {
    const key = `${entry.kind}:${entry.id}`
    if (!entry.id || !entry.title || seen.has(key)) return
    seen.add(key)
    entries.push(entry)
  }
  if (repeat.length) {
    push({ icon: 'repeat', id: REPEAT_ID, kind: 'special', subtitle: plural(repeat.length, 'canción', 'canciones'), thumbnail: null, title: 'En repetición' })
  }
  if (likedSongs.length) {
    push({ icon: 'heart', id: LIKED_ID, kind: 'special', subtitle: plural(data.likedTotal ?? likedSongs.length, 'canción', 'canciones'), thumbnail: thumb(likedSongs[0]?.thumbnail, QUICK_THUMB_PX), title: 'Música que me gusta' })
  }
  // Los fijados a mano van justo después de las dos listas especiales y antes de lo automático.
  pinned.forEach((entry) => push({ ...entry, pinned: true }))
  ;(data?.playlists ?? []).filter((playlist) => !isYoutubeLikedList(playlist)).forEach((playlist) => push({
    id: playlist.id, kind: 'playlist', subtitle: plural(playlist.itemCount ?? 0, 'canción', 'canciones'), thumbnail: thumb(playlist.thumbnail, QUICK_THUMB_PX), title: playlist.title,
  }))
  ;(data?.albums ?? []).forEach((album) => push({
    id: album.id, kind: 'album', subtitle: album.artist ?? 'Álbum', thumbnail: thumb(album.thumbnail, QUICK_THUMB_PX), title: album.title,
  }))
  // Caben todos los fijados a mano (hasta el tope); lo automático solo rellena hasta `limit`.
  const fixed = entries.filter((entry) => entry.pinned || entry.kind === 'special').length
  const shown = entries.slice(0, Math.max(limit, Math.min(QUICK_ACCESS_MAX, fixed)))
  if (!order.length) return shown
  // Orden elegido arrastrando: lo colocado va primero en ese orden; lo demás conserva el suyo detrás (orden estable).
  const rank = new Map(order.map((key, index) => [key, index]))
  const rankOf = (entry) => rank.get(`${entry.kind}:${entry.id}`) ?? Infinity
  return shown.map((entry, index) => ({ entry, index })).sort((a, b) => (rankOf(a.entry) - rankOf(b.entry)) || (a.index - b.index)).map((item) => item.entry)
}
