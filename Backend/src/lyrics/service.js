const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { parseLrc } = require('./lrc')
const { createTtlCache } = require('../ttl-cache')

const LRCLIB_URL = 'https://lrclib.net/api'
const USER_AGENT = 'Mysic/1.0 (lyrics client)'
const MAX_DURATION_DIFF_SECONDS = 3
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 6 * 60 * 60 * 1000
const MEMORY_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 6000

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    // Quita sufijos habituales que rompen la coincidencia: (Remastered), - Single, feat.
    .replace(/\s*[([][^)\]]*(remaster|version|live|feat|ft\.)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(single|remaster(ed)?(\s+\d{4})?|album version)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cacheKey({ artist, title, duration }) {
  const raw = `${normalize(artist)}|${normalize(title)}|${Math.round(duration || 0)}`
  return crypto.createHash('sha1').update(raw).digest('hex')
}

function durationDiff(candidate, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(candidate?.duration)) {
    return Number.POSITIVE_INFINITY
  }
  return Math.abs(candidate.duration - duration)
}

/** Elige el mejor candidato: solo si la duración coincide; prefiere letra sincronizada. */
function pickBest(candidates, duration) {
  const usable = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => (item?.syncedLyrics || item?.plainLyrics) && !item.instrumental)
    .filter((item) => durationDiff(item, duration) <= MAX_DURATION_DIFF_SECONDS)

  usable.sort((a, b) => {
    const synced = Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics))
    return synced || durationDiff(a, duration) - durationDiff(b, duration)
  })
  return usable[0] ?? null
}

function toResult(candidate) {
  const synced = candidate.syncedLyrics ? parseLrc(candidate.syncedLyrics) : []
  return {
    found: true,
    source: 'lrclib',
    synced,
    plain: candidate.plainLyrics || synced.map((line) => line.text).join('\n'),
  }
}

function createLyricsService({
  cacheDir,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  baseUrl = LRCLIB_URL,
} = {}) {
  const inflight = new Map()
  // Capa en memoria delante del disco: evita leer y parsear el JSON en cada consulta repetida.
  const memory = createTtlCache({ ttlMs: MEMORY_TTL_MS, maxSize: 500, now })
  let writeCounter = 0
  let pruned = false

  async function readCache(key) {
    const inMemory = memory.get(key)
    if (inMemory) return inMemory
    if (!cacheDir) return null
    try {
      const entry = JSON.parse(await fs.readFile(path.join(cacheDir, `${key}.json`), 'utf8'))
      const ttl = entry.result?.found ? HIT_TTL_MS : MISS_TTL_MS
      if (now() - entry.savedAt >= ttl) return null
      memory.set(key, entry.result)
      return entry.result
    } catch {
      return null
    }
  }

  async function writeCache(key, result) {
    memory.set(key, result)
    if (!cacheDir) return
    try {
      await fs.mkdir(cacheDir, { recursive: true })
      // Escritura atómica: archivo temporal + rename, para que un lector nunca vea un JSON a medias.
      const target = path.join(cacheDir, `${key}.json`)
      const temporary = `${target}.${process.pid}.${writeCounter += 1}.tmp`
      await fs.writeFile(temporary, JSON.stringify({ savedAt: now(), result }), 'utf8')
      await fs.rename(temporary, target)
    } catch {
      // La caché es opcional: un fallo de disco no debe romper la respuesta.
    }
  }

  /** Borra del disco las entradas más antiguas que el TTL de aciertos (una vez por proceso). */
  async function pruneExpired() {
    if (!cacheDir) return
    try {
      for (const name of await fs.readdir(cacheDir)) {
        if (!name.endsWith('.json') && !name.endsWith('.tmp')) continue
        const file = path.join(cacheDir, name)
        const { mtimeMs } = await fs.stat(file)
        if (now() - mtimeMs > HIT_TTL_MS) await fs.rm(file, { force: true })
      }
    } catch {
      // Sin directorio todavía o carrera con otra escritura: no es un error.
    }
  }

  async function getJson(url) {
    const response = await fetchImpl(String(url), {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`LRCLIB respondió ${response.status}`)
    return response.json()
  }

  async function lookup({ artist, title, album, duration }) {
    const exact = new URL(`${baseUrl}/get`)
    exact.searchParams.set('artist_name', artist)
    exact.searchParams.set('track_name', title)
    if (album) exact.searchParams.set('album_name', album)
    if (duration > 0) exact.searchParams.set('duration', String(Math.round(duration)))

    const direct = pickBest([await getJson(exact)].filter(Boolean), duration)
    if (direct) return toResult(direct)

    const search = new URL(`${baseUrl}/search`)
    search.searchParams.set('artist_name', artist)
    search.searchParams.set('track_name', title)
    const best = pickBest(await getJson(search), duration)
    return best ? toResult(best) : { found: false }
  }

  /**
   * Devuelve la letra de una canción. Resultados y ausencias se guardan en disco;
   * las consultas simultáneas iguales comparten una sola petición a LRCLIB.
   * Los errores de red no se cachean para poder reintentar.
   */
  async function getLyrics(track) {
    if (!pruned) {
      pruned = true
      pruneExpired()
    }
    const key = cacheKey(track)
    const cached = await readCache(key)
    if (cached) return { ...cached, cached: true }

    if (!inflight.has(key)) {
      const task = lookup(track)
        .then(async (result) => {
          await writeCache(key, result)
          return result
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, task)
    }
    return { ...(await inflight.get(key)), cached: false }
  }

  return { getLyrics }
}

module.exports = { createLyricsService, pickBest, normalize, cacheKey }
