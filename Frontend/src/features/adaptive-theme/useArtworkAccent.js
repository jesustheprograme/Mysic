import { useEffect, useState } from 'react'
import { pickAccent } from './dominantColor.js'

const SAMPLE_SIZE = 32
const MAX_CACHED = 300
const MAX_CONCURRENT = 3
const cache = new Map()

// Un solo canvas compartido y como mucho 3 descargas a la vez: antes cada portada creaba su canvas y
// todas se pedían a la vez, lo que en listas largas (cientos de artistas) disparaba la memoria.
let sharedContext = null
let running = 0
const waiting = []

function remember(url, accent) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value)
  cache.set(url, accent)
}

function getContext() {
  if (!sharedContext) {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    sharedContext = canvas.getContext('2d', { willReadFrequently: true })
  }
  return sharedContext
}

function sample(url) {
  return new Promise((resolve) => {
    const image = new Image()
    // Sin CORS el canvas queda "contaminado" y getImageData lanza; en ese caso no hay acento.
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    const finish = (accent) => {
      image.onload = null
      image.onerror = null
      image.src = '' // libera la imagen decodificada
      resolve(accent)
    }
    image.onload = () => {
      try {
        const context = getContext()
        context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        finish(pickAccent(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data))
      } catch {
        finish(null)
      }
    }
    image.onerror = () => finish(null)
    image.src = url
  })
}

function pump() {
  while (running < MAX_CONCURRENT && waiting.length) {
    const job = waiting.shift()
    if (job.cancelled) continue
    running += 1
    sample(job.url).then((accent) => {
      running -= 1
      job.resolve(accent)
      pump()
    })
  }
}

function extractAccent(url) {
  const job = { url, cancelled: false }
  const promise = new Promise((resolve) => {
    job.resolve = resolve
    waiting.push(job)
    pump()
  })
  return { promise, cancel: () => { job.cancelled = true } }
}

/** Color de acento de la portada, o null mientras carga o si no se puede leer. `enabled:false` no descarga nada. */
export function useArtworkAccent(url, { enabled = true } = {}) {
  const [state, setState] = useState({ url: null, accent: null })

  useEffect(() => {
    if (!url || !enabled) return undefined
    if (cache.has(url)) {
      setState({ url, accent: cache.get(url) })
      return undefined
    }

    let cancelled = false
    const job = extractAccent(url)
    job.promise.then((accent) => {
      remember(url, accent)
      if (!cancelled) setState({ url, accent })
    })
    return () => {
      cancelled = true
      job.cancel()
    }
  }, [url, enabled])

  // Evita mostrar el color de la canción anterior mientras carga la nueva portada.
  return state.url === url ? state.accent : null
}