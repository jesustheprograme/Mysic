// Subtítulo de un artista tal como lo entrega YouTube Music ("17.6M monthly audience", "1 subscriber") -> español.
// Lógica pura. Lo que ya viene en español o no se reconoce se deja como está.

const UNITS = [
  [/^monthly (?:audience|listeners)$/i, (_count, short) => (short ? 'oyentes' : 'oyentes mensuales')],
  [/^subscribers?$/i, (count) => (count === '1' ? 'suscriptor' : 'suscriptores')],
  [/^views?$/i, (count) => (count === '1' ? 'visualización' : 'visualizaciones')],
  [/^songs?$/i, (count) => (count === '1' ? 'canción' : 'canciones')],
  [/^albums?$/i, (count) => (count === '1' ? 'álbum' : 'álbumes')],
]

const KINDS = { artist: 'Artista', album: 'Álbum', song: 'Canción', single: 'Sencillo', playlist: 'Playlist', video: 'Vídeo' }

/** "17.6M" -> "17,6 M" (coma decimal y espacio antes de la abreviatura, como se escribe en español). */
export function spanishNumber(text) {
  const match = /^(\d[\d.,]*?)([KMB])?$/i.exec(String(text).trim())
  if (!match) return String(text)
  const [, digits, suffix] = match
  const value = /^\d+\.\d+$/.test(digits) ? digits.replace('.', ',') : digits
  return suffix ? `${value} ${suffix.toUpperCase()}` : value
}

function translatePart(part, short) {
  const text = part.trim()
  const kind = KINDS[text.toLowerCase()]
  if (kind) return kind
  const match = /^(\d[\d.,]*[KMB]?)\s+(.+)$/i.exec(text)
  if (!match) return text
  const [, count, unit] = match
  for (const [pattern, translate] of UNITS) {
    if (pattern.test(unit)) return `${spanishNumber(count)} ${translate(count, short)}`
  }
  return text
}

/** `short`: para tarjetas estrechas ("17,6 M oyentes" en vez de "17,6 M oyentes mensuales"). */
export function artistMeta(subtitle, { short = false } = {}) {
  if (typeof subtitle !== 'string' || !subtitle.trim()) return 'Artista'
  return subtitle.split(/\s+[•·]\s+/).map((part) => translatePart(part, short)).join(' · ')
}