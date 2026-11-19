// Importar una playlist de Spotify: emparejar cada canción con YouTube Music. Lógica pura (sin React ni red: la
// búsqueda se inyecta). Referencia: import.rs de limusic (GPL-3.0, solo como guía de los niveles y del flujo).
//
// Limusic va despacio a propósito (una canción cada ~2 s y un presupuesto de búsquedas por hora). Aquí las búsquedas
// van a nuestro servidor, que ya las cachea, así que se hacen varias a la vez.
import { cleanTitle, trackQuery } from '../youtube/ytLink.js'

export const IMPORT_CONCURRENCY = 6
const CANDIDATES = 5

/** Texto comparable: minúsculas, sin acentos ni signos. */
export const normalize = (text) => String(text ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

/** 0..1: cuánto se parecen dos títulos (sin sufijos de edición como "- Remastered" ni "(feat. …)"). */
export function titleSimilarity(a, b) {
  const first = normalize(cleanTitle(a).replace(/\s*[([]\s*(feat|ft|with)\b[^)\]]*[)\]]/gi, ''))
  const second = normalize(cleanTitle(b).replace(/\s*[([]\s*(feat|ft|with)\b[^)\]]*[)\]]/gi, ''))
  if (!first || !second) return 0
  if (first === second) return 1
  if (first.includes(second) || second.includes(first)) return 0.9
  const one = new Set(first.split(' '))
  const two = new Set(second.split(' '))
  let shared = 0
  for (const word of one) if (two.has(word)) shared += 1
  return (shared / Math.min(one.size, two.size)) * 0.8
}

/** ¿Alguno de los artistas de Spotify aparece en el resultado de YouTube Music (artista o título)? */
export function artistMatches(artists, result) {
  const haystack = normalize(`${result?.artist ?? ''} ${result?.title ?? ''}`)
  if (!haystack) return false
  return (artists ?? []).some((name) => {
    const clean = normalize(name)
    return clean.length > 1 && haystack.includes(clean)
  })
}

/**
 * La canción de YouTube Music para una de Spotify, entre los primeros resultados de su búsqueda.
 *  - matched: título y artista coinciden.
 *  - check: hay un candidato razonable pero con dudas (se incluye, y se avisa para revisarlo).
 *  - missing: nada se le parece.
 */
export function pickMatch(track, results) {
  const candidates = (results ?? []).filter((item) => item?.id).slice(0, CANDIDATES)
  if (!candidates.length) return { tier: 'missing', song: null }
  const scored = candidates.map((song, index) => ({
    song,
    index,
    title: titleSimilarity(track.title, song.title),
    artist: artistMatches(track.artists, song),
  }))
  const sure = scored.find((entry) => entry.title >= 0.8 && entry.artist)
  if (sure) return { tier: 'matched', song: sure.song }
  const maybe = scored
    .filter((entry) => entry.title >= 0.8 || (entry.artist && entry.title >= 0.5))
    .sort((x, y) => (y.title + Number(y.artist)) - (x.title + Number(x.artist)) || x.index - y.index)[0]
  if (maybe) return { tier: 'check', song: maybe.song }
  return { tier: 'missing', song: null }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Empareja todas las pistas con `concurrency` búsquedas a la vez. `search(texto)` devuelve la lista de resultados.
 * Una búsqueda que falla se reintenta una vez; si vuelve a fallar la canción cuenta como no encontrada (`failed`).
 * `onProgress(entry, index)` se llama con cada pista resuelta. Devuelve un arreglo en el orden de la lista; las
 * pistas que no llegaron a mirarse (si se paró) quedan sin definir.
 */
export async function runMatching({ concurrency = IMPORT_CONCURRENCY, onProgress, retryDelayMs = 400, search, signal, tracks }) {
  const results = new Array(tracks.length)
  let next = 0
  const lookup = async (track) => {
    const query = trackQuery(track)
    if (!query) return { tier: 'missing', song: null }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return pickMatch(track, await search(query, signal))
      } catch (error) {
        if (signal?.aborted) throw error
        if (attempt === 0) await wait(retryDelayMs)
      }
    }
    return { tier: 'missing', song: null, failed: true }
  }
  const worker = async () => {
    while (!signal?.aborted) {
      const index = next
      next += 1
      if (index >= tracks.length) return
      let entry
      try {
        entry = await lookup(tracks[index])
      } catch {
        return // se paró en mitad de una búsqueda
      }
      if (signal?.aborted) return
      results[index] = { track: tracks[index], ...entry }
      onProgress?.(results[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tracks.length) }, worker))
  return results
}

/**
 * Las canciones que caben en `maxBytes` de JSON, en orden. El servidor limita el cuerpo de cada petición (32 kB hasta
 * que se amplíe) y una playlist se guarda entera de una vez: ~370 bytes por canción.
 */
export function fitTracks(tracks, maxBytes) {
  let size = 2
  const fitted = []
  for (const track of tracks) {
    size += JSON.stringify(track).length + 1
    if (size > maxBytes) break
    fitted.push(track)
  }
  return fitted
}
