// Comentarios de YouTube: YouTube entrega la fecha relativa y los contadores en inglés ("6 years ago (edited)",
// "429K"). Aquí se pasan a español para mostrarlos.

const UNITS = {
  second: ['segundo', 'segundos'],
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
}

/** "6 years ago (edited)" → "hace 6 años (editado)". Lo que no reconoce lo deja igual. */
export function translatePublished(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const edited = /\(edited\)/i.test(value)
  const match = value.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i)
  if (!match) return value.trim()
  const count = Number(match[1])
  const [one, many] = UNITS[match[2].toLowerCase()]
  return `hace ${count} ${count === 1 ? one : many}${edited ? ' (editado)' : ''}`
}

/** "429K" → "429 K", "1.2M" → "1,2 M", "0"/"" → "". */
export function formatLikes(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '0') return ''
  const match = raw.match(/^([\d.,]+)\s*([KMB])?$/i)
  if (!match) return raw
  const number = match[1].replace('.', ',')
  const suffix = match[2] ? ` ${match[2].toUpperCase() === 'B' ? 'mil M' : match[2].toUpperCase()}` : ''
  return `${number}${suffix}`
}

/** Total de comentarios con separador de miles en español. */
export function formatTotal(total) {
  if (!Number.isFinite(total) || total <= 0) return ''
  return `${total.toLocaleString('es-ES')} ${total === 1 ? 'comentario' : 'comentarios'}`
}

/** Une páginas sin duplicar comentarios (una página puede repetir el fijado). */
export function mergeComments(current, incoming) {
  const seen = new Set(current.map((comment) => comment.id))
  return [...current, ...incoming.filter((comment) => comment?.id && !seen.has(comment.id))]
}
