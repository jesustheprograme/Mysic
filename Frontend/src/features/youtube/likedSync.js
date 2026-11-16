// Sincronización de las canciones "Me gusta" (lógica pura, sin red ni almacenamiento).
//
// Medido (2026-11-16): una cuenta real tiene 5.999 Me gusta únicos en 63 páginas (~59 s pidiéndolas todas) y YouTube
// no da el total por adelantado. Por eso la lista completa se guarda en el equipo y cada arranque solo pide lo que
// cambió: YouTube entrega lo más reciente primero, así que basta con pedir páginas hasta llegar a una que ya se tenía
// entera y unir esa cabecera nueva con el resto de lo guardado.

/** Cada cuánto se repite la carga completa (para notar canciones quitadas en otro dispositivo, más abajo de la cabecera). */
export const FULL_SYNC_MS = 24 * 60 * 60 * 1000
/** Tope de páginas por sincronización: protege de un bucle si el servidor repitiera cursores. */
export const MAX_LIKED_PAGES = 200

/** Quita repetidos (YouTube repite ~4 % de canciones entre páginas) conservando el orden. Función pura. */
export function dedupeById(songs) {
  const seen = new Set()
  const out = []
  for (const song of songs) {
    if (!song?.id || seen.has(song.id)) continue
    seen.add(song.id)
    out.push(song)
  }
  return out
}

/** ¿Hace falta la carga completa? Sin lista completa guardada, o si la última completa es de hace más de un día. */
export const needsFullSync = (stored, now = Date.now()) => !stored?.complete || !stored.fullAt || now - stored.fullAt > FULL_SYNC_MS

/** ¿Esta página ya se tenía entera? Entonces todo lo que sigue también está guardado y se puede parar. */
export const pageIsKnown = (items, knownIds) => items.length > 0 && items.every((item) => knownIds.has(item.id))

/**
 * Une la cabecera recién pedida (`fetched`, de lo más reciente hacia atrás) con lo guardado: lo nuevo y lo que siga
 * igual sale de `fetched`; lo de después del último elemento pedido sale de `stored`. Así una canción quitada dentro de
 * la cabecera desaparece y una añadida aparece arriba. Si el último pedido no está guardado, la lista es solo `fetched`.
 */
export function mergeLikedHead(fetched, stored) {
  const head = dedupeById(fetched)
  const anchor = head.at(-1)?.id
  const index = anchor ? stored.findIndex((song) => song.id === anchor) : -1
  if (index < 0) return head
  return dedupeById([...head, ...stored.slice(index + 1)])
}
