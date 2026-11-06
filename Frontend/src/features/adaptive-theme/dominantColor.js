function toHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l: lightness }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness }
}

function fromHsl(h, s, l) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - chroma / 2
  const [r, g, b] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(h / 60) % 6]
  return [r, g, b].map((value) => Math.round((value + m) * 255))
}

const toHex = (channels) => `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`

/**
 * Elige un color de acento a partir de píxeles RGBA (por ejemplo, una portada reducida).
 * Agrupa por tono, ignora transparentes, casi negros/blancos y grises, y pondera por
 * saturación. Devuelve un hex con luminosidad acotada para leerse sobre fondo oscuro,
 * o null si la imagen no tiene color útil.
 */
export function pickAccent(pixels) {
  if (!pixels || pixels.length < 4) return null

  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, hue: 0, saturation: 0 }))
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue
    const { h, s, l } = toHsl(pixels[index], pixels[index + 1], pixels[index + 2])
    if (s < 0.2 || l < 0.12 || l > 0.9) continue

    const bucket = buckets[Math.floor(h / 30) % 12]
    bucket.weight += s
    bucket.hue += h * s
    bucket.saturation += s * s
  }

  const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top))
  if (best.weight === 0) return null

  const hue = best.hue / best.weight
  const saturation = Math.min(0.75, Math.max(0.35, best.saturation / best.weight))
  return toHex(fromHsl(hue, saturation, 0.42))
}
