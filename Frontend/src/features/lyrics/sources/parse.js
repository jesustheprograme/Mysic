// Analizadores de letras: LRC, TTML (Apple, el que entrega Boidu) y KPOE (LyricsPlus). Todos devuelven líneas
// { time (s), text } ordenadas. Sin DOMParser: funcionan igual en la app y en las pruebas de Node, y una letra de
// 40 KB se lee en ~1 ms con expresiones regulares.

const LRC_STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const LRC_OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]$/i
// Etiquetas de palabra del LRC extendido: <00:12.34>
const ELRC_WORD = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g

const round = (value) => Math.max(0, Number(value.toFixed(3)))

/** LRC → líneas. Varias marcas por línea, `[offset:ms]`, metadatos fuera; las líneas vacías marcan pausas. */
export function parseLrc(source) {
  if (typeof source !== 'string' || !source.trim()) return []
  let offset = 0
  const lines = []
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const tag = LRC_OFFSET.exec(line)
    if (tag) { offset = Number(tag[1]) / 1000; continue }
    const stamps = [...line.matchAll(LRC_STAMP)]
    if (!stamps.length) continue
    const text = line.replace(LRC_STAMP, '').replace(ELRC_WORD, '').replace(/\s+/g, ' ').trim()
    for (const [, m, s, f] of stamps) lines.push({ time: Number(m) * 60 + Number(s) + (f ? Number(`0.${f}`) : 0), text })
  }
  return lines.map((entry) => ({ time: round(entry.time + offset), text: entry.text })).sort((a, b) => a.time - b.time)
}

/** Tiempo TTML: "9.731", "3:49.021", "1:02:03.5", "12.5s" o "00:01:02.500" → segundos. */
export function parseTtmlTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const clean = value.trim().replace(/s$/, '')
  const parts = clean.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000) / 1000
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decodeEntities = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)

/** Separa los <span ttm:role="x-bg"> (con sus <span> internos) del resto del contenido de una línea. */
function splitBackground(inner) {
  let main = ''
  let background = ''
  let index = 0
  const tag = /<(\/?)span\b([^>]*)>/g
  while (index < inner.length) {
    tag.lastIndex = index
    let open = tag.exec(inner)
    while (open && (open[1] || !open[2].includes('x-bg'))) open = tag.exec(inner)
    if (!open) { main += inner.slice(index); break }
    main += inner.slice(index, open.index)
    let depth = 1
    let end = inner.length
    let next
    while (depth > 0 && (next = tag.exec(inner))) {
      depth += next[1] ? -1 : 1
      if (depth === 0) end = next.index + next[0].length
    }
    background += ` ${inner.slice(open.index, end)}`
    index = end
  }
  return { main, background }
}

/**
 * TTML → líneas. Cada <p begin> es una línea; su texto es el de sus <span> (palabras) sin los de fondo
 * (ttm:role="x-bg", coros), que se añaden entre paréntesis. `lyricOffset` de Apple se respeta.
 */
export function parseTtml(source) {
  if (typeof source !== 'string' || !source.includes('<p')) return []
  const offset = Number(/lyricOffset="(-?[\d.]+)"/.exec(source)?.[1]) || 0
  const text = (value) => decodeEntities(value.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  // Romanizado de Apple (<transliteration xml:lang="ja-Latn"><text for="L24">…</text>): por la clave de cada línea.
  const romanized = new Map()
  const block = /<transliteration\b[^>]*>([\s\S]*?)<\/transliteration>/.exec(source)?.[1] ?? ''
  for (const entry of block.matchAll(/<text\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)) romanized.set(entry[1], text(entry[2]))
  // Traducción de Apple (<translation xml:lang="en"><text for="L24">…</text>), igual: por la clave de cada línea.
  const translated = new Map()
  const translation = /<translation\b([^>]*)>([\s\S]*?)<\/translation>/.exec(source)
  const translationLang = /\bxml:lang="([^"]+)"/.exec(translation?.[1] ?? '')?.[1] ?? null
  for (const entry of (translation?.[2] ?? '').matchAll(/<text\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)) translated.set(entry[1], text(entry[2]))
  const lines = []
  for (const match of source.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const begin = parseTtmlTime(/\bbegin="([^"]+)"/.exec(match[1])?.[1])
    if (begin == null) continue
    const { main: inner, background } = splitBackground(match[2])
    const main = text(inner)
    const extra = text(background).replace(/^\(|\)$/g, '')
    const line = { time: round(begin + offset), text: extra ? `${main} (${extra})`.trim() : main }
    const key = /\bitunes:key="([^"]+)"/.exec(match[1])?.[1]
    const reading = romanized.get(key)
    if (reading && reading !== line.text) line.romanized = reading
    const meaning = translated.get(key)
    if (meaning && meaning !== line.text) Object.assign(line, { translation: meaning, translationLang })
    lines.push(line)
  }
  return lines.sort((a, b) => a.time - b.time)
}

/** KPOE (LyricsPlus): { lyrics: [{ time (ms), text, syllabus }] } → líneas. */
export function parseKpoe(data) {
  const items = Array.isArray(data?.lyrics) ? data.lyrics : []
  return items
    .filter((item) => Number.isFinite(item?.time))
    .map((item) => {
      const line = {
        time: round(item.time / 1000),
        text: String(item.text || (item.syllabus || []).map((part) => part.text).join('') || '').replace(/\s+/g, ' ').trim(),
      }
      // Apple repite tal cual las líneas ya latinas como su propia lectura: solo se guarda si aporta algo.
      const reading = String(item.transliteration?.text || '').replace(/\s+/g, ' ').trim()
      if (reading && reading !== line.text) line.romanized = reading
      const meaning = String(item.translation?.text || '').replace(/\s+/g, ' ').trim()
      if (meaning && meaning !== line.text) Object.assign(line, { translation: meaning, translationLang: item.translation?.lang ?? data?.metadata?.translationLang ?? null })
      return line
    })
    .sort((a, b) => a.time - b.time)
}

/** Texto cualquiera: TTML, JSON KPOE o LRC, en ese orden. */
export function parseAny(source) {
  if (typeof source !== 'string') return []
  const trimmed = source.trim()
  if (trimmed.startsWith('<')) return parseTtml(trimmed)
  if (trimmed.startsWith('{') || trimmed.startsWith('[{')) {
    try { return parseKpoe(JSON.parse(trimmed)) } catch { /* no era JSON */ }
  }
  return parseLrc(trimmed)
}

/**
 * Una letra "plana" (todas las líneas con el mismo tiempo, o una sola con tiempo) no está sincronizada de verdad:
 * se trata como texto plano para no resaltar una línea fija.
 */
export function isFlat(lines) {
  if (lines.length < 2) return true
  const first = lines[0].time
  return lines.every((line) => line.time === first)
}

/** Resultado común de los proveedores. `null` = no tiene esta canción. */
export function toResult(lines, plainText = '') {
  const timed = Array.isArray(lines) ? lines.filter((line) => Number.isFinite(line.time)) : []
  if (timed.length && !isFlat(timed) && timed.some((line) => line.text)) {
    return { synced: true, lines: timed, plain: timed.map((line) => line.text).filter(Boolean).join('\n') }
  }
  const plain = (plainText || timed.map((line) => line.text).join('\n')).replace(/\r\n/g, '\n').trim()
  return plain ? { synced: false, lines: [], plain } : null
}
