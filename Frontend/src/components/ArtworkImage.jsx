import { useState } from 'react'
import { artworkSources, isMissingThumb } from '../lib/imageSize.js'

/**
 * Portada grande nítida: prueba las URLs de `artworkSources` en orden (maxresdefault para miniaturas de vídeo, tamaño
 * reescrito para Google) y pasa a la siguiente si una falla o es el gris de 120x90 de YouTube. La original queda de
 * fondo mientras carga la grande: no hay hueco en blanco al cambiar de canción.
 */
export default function ArtworkImage({ url, size, className, alt = '' }) {
  const sources = artworkSources(url, size)
  const key = sources.join('|')
  const [failed, setFailed] = useState({ key, count: 0 })
  const count = failed.key === key ? failed.count : 0
  const src = sources[Math.min(count, sources.length - 1)]
  if (!src) return null
  const next = () => setFailed({ key, count: count + 1 })
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      decoding="async"
      style={url !== src ? { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      onError={count < sources.length - 1 ? next : undefined}
      onLoad={(event) => { if (isMissingThumb(event.currentTarget) && count < sources.length - 1) next() }}
    />
  )
}
