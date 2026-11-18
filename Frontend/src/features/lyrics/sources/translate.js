// Traducción de la letra al español (o al idioma pedido).
// 1. La de la fuente, si viene en ese idioma (Apple/LyricsPlus a veces traen traducción por línea: `line.translation`).
// 2. Si no, traducción automática de Google (endpoint público `translate_a/single`, el de la extensión del navegador),
//    pedida desde el equipo por el comando Rust `lyrics_http` (dominio en su lista). Solo se envía el texto de la letra.
// 3. Si la automática falla, la traducción de la fuente aunque sea en otro idioma (mejor que nada).
// Se traduce cada línea distinta una sola vez, en bloques de texto unidos por saltos de línea.

export const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single'
const MAX_BLOCK_CHARS = 4000 // por petición (el texto va en el cuerpo de un POST)
const CACHE_LIMIT = 40

/** Petición para `lyrics_http`: un bloque de líneas unidas por saltos de línea. */
export function translationRequest(texts, target) {
  const query = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't' })
  return { url: `${TRANSLATE_URL}?${query}`, method: 'POST', form: `q=${encodeURIComponent(texts.join('\n'))}` }
}

/**
 * Respuesta → { lang (idioma detectado), lines }. `lines` tiene una traducción por línea pedida, o null si no cuadran
 * (Google partió o juntó líneas): mejor no mostrar nada que mostrar la traducción de otra línea.
 */
export function parseTranslation(body, count) {
  let data
  try { data = typeof body === 'string' ? JSON.parse(body) : body } catch { return { lang: null, lines: null } }
  const segments = Array.isArray(data?.[0]) ? data[0] : []
  const text = segments.map((segment) => (typeof segment?.[0] === 'string' ? segment[0] : '')).join('')
  const lang = typeof data?.[2] === 'string' ? data[2] : null
  const lines = text.split('\n').map((line) => line.trim())
  if (lines.at(-1) === '' && lines.length === count + 1) lines.pop()
  return { lang, lines: lines.length === count ? lines : null }
}

/** Bloques de líneas que no pasan de `max` caracteres (una línea larga va sola). */
export function blocks(texts, max = MAX_BLOCK_CHARS) {
  const out = []
  let current = []
  let size = 0
  for (const text of texts) {
    if (current.length && size + text.length + 1 > max) { out.push(current); current = []; size = 0 }
    current.push(text)
    size += text.length + 1
  }
  if (current.length) out.push(current)
  return out
}

const sameText = (a, b) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
const isTarget = (lang, target) => Boolean(lang) && lang.toLowerCase().split('-')[0] === target

/** Traducción automática de unas líneas. → { lang, byText: Map(original → traducción) }. Lanza si falla. */
export async function machineTranslate(texts, { http, target }) {
  const unique = [...new Set(texts.map((text) => text.trim()).filter(Boolean))]
  const byText = new Map()
  let lang = null
  for (const block of blocks(unique)) {
    const response = await http(translationRequest(block, target))
    if (response?.status !== 200) throw new Error(`TRANSLATE_HTTP_${response?.status ?? 'NONE'}`)
    const parsed = parseTranslation(response.body, block.length)
    if (!parsed.lines) throw new Error('TRANSLATE_MISMATCH')
    lang ??= parsed.lang
    // Ya está en el idioma pedido: no hace falta seguir (ni mostrar nada).
    if (isTarget(lang, target)) return { lang, byText: new Map() }
    block.forEach((original, index) => { if (parsed.lines[index] && !sameText(parsed.lines[index], original)) byText.set(original, parsed.lines[index]) })
  }
  return { lang, byText }
}

/** Traducción de la fuente (`line.translation` / `line.translationLang`) como mapa por texto. */
export function sourceTranslation(lines) {
  const byText = new Map()
  let lang = null
  for (const line of lines) {
    if (!line.text || !line.translation || sameText(line.translation, line.text)) continue
    byText.set(line.text.trim(), line.translation)
    lang ??= line.translationLang ?? null
  }
  return { lang, byText }
}

/**
 * Traductor con caché por canción (la vista extensa y el controlador comparten resultado y petición en curso).
 * `translate(key, lines)` → { lang, byText, source: 'lyrics' | 'machine', original } donde `original` es el idioma
 * detectado de la letra (si es el pedido, `byText` va vacío y la interfaz lo dice).
 */
export function createTranslator({ http, target = 'es' }) {
  const cache = new Map()
  return function translate(key, lines) {
    const cacheKey = `${target}|${key}`
    const hit = cache.get(cacheKey)
    if (hit) return hit
    const fromSource = sourceTranslation(lines)
    const request = (async () => {
      if (fromSource.byText.size && isTarget(fromSource.lang, target)) return { ...fromSource, source: 'lyrics', original: null }
      try {
        const machine = await machineTranslate(lines.map((line) => line.text || ''), { http, target })
        return { lang: target, byText: machine.byText, source: 'machine', original: machine.lang }
      } catch (error) {
        if (fromSource.byText.size) return { ...fromSource, source: 'lyrics', original: null }
        throw error
      }
    })()
    cache.set(cacheKey, request)
    request.catch(() => cache.delete(cacheKey)) // un fallo se puede reintentar
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
    return request
  }
}
