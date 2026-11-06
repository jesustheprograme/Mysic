import { useEffect, useState } from 'react'
import { pickAccent } from './dominantColor.js'

const SAMPLE_SIZE = 32
const MAX_CACHED = 100
const cache = new Map()

function remember(url, accent) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value)
  cache.set(url, accent)
}

function extractAccent(url) {
  return new Promise((resolve) => {
    const image = new Image()
    // Sin CORS el canvas queda "contaminado" y getImageData lanza; en ese caso no hay acento.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        resolve(pickAccent(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

/** Color de acento de la portada actual, o null mientras carga o si no se puede leer. */
export function useArtworkAccent(url) {
  const [state, setState] = useState({ url: null, accent: null })

  useEffect(() => {
    if (!url) return undefined
    if (cache.has(url)) {
      setState({ url, accent: cache.get(url) })
      return undefined
    }

    let cancelled = false
    extractAccent(url).then((accent) => {
      remember(url, accent)
      if (!cancelled) setState({ url, accent })
    })
    return () => { cancelled = true }
  }, [url])

  // Evita mostrar el color de la canción anterior mientras carga la nueva portada.
  return state.url === url ? state.accent : null
}
