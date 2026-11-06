const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i

function toSeconds(minutes, seconds, fraction) {
  const fractionSeconds = fraction ? Number(`0.${fraction}`) : 0
  return Number(minutes) * 60 + Number(seconds) + fractionSeconds
}

/**
 * Convierte texto LRC en líneas ordenadas por tiempo.
 * Admite varias marcas por línea, `[offset:ms]` y descarta etiquetas de metadatos.
 * Las líneas vacías se conservan: marcan pausas instrumentales.
 */
function parseLrc(source) {
  if (typeof source !== 'string' || !source.trim()) return []

  let offsetSeconds = 0
  const lines = []

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const offset = OFFSET_TAG.exec(line)
    if (offset) {
      offsetSeconds = Number(offset[1]) / 1000
      continue
    }

    const stamps = [...line.matchAll(TIMESTAMP)]
    // Sin marcas de tiempo (etiquetas [ar:], [ti:], texto suelto): no es una línea sincronizada.
    if (stamps.length === 0) continue

    const text = line.replace(TIMESTAMP, '').trim()
    for (const stamp of stamps) {
      lines.push({ time: toSeconds(stamp[1], stamp[2], stamp[3]), text })
    }
  }

  return lines
    .map((entry) => ({ ...entry, time: Math.max(0, Number((entry.time + offsetSeconds).toFixed(3))) }))
    .sort((a, b) => a.time - b.time)
}

module.exports = { parseLrc }
