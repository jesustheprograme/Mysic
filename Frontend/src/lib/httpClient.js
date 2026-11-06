export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])

function combineSignals(signals) {
  const active = signals.filter(Boolean)
  if (active.length <= 1) return active[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active)

  const controller = new AbortController()
  active.forEach((signal) => {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  })
  return controller.signal
}

/**
 * Cliente HTTP de la API de Mysic.
 *
 * - Timeout por petición para que un servidor colgado no deje la interfaz en un spinner eterno.
 * - Deduplica GET idénticos en vuelo (varios componentes pidiendo lo mismo = una sola petición).
 *   Si el llamador pasa su propia `signal` no se deduplica, para respetar su cancelación.
 * - Un reintento en GET ante 502/503/504 o fallo de red. Nunca se reintentan escrituras.
 * - Sin `Content-Type` en GET: evita el preflight CORS que provoca esa cabecera.
 */
export function createHttpClient({
  baseUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 20000,
  retryDelayMs = 300,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const inflight = new Map()

  async function attempt(path, options) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
    const hasBody = options.body !== undefined && options.body !== null
    // Las escrituras (p. ej. subir una portada de hasta 10 MB) necesitan más margen que una lectura.
    const isRead = (options.method ?? 'GET').toUpperCase() === 'GET'
    const timeoutSignal = AbortSignal.timeout(isRead ? timeoutMs : timeoutMs * 3)
    const signal = combineSignals([options.signal, timeoutSignal])

    let response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        credentials: 'include',
        ...options,
        headers: {
          ...(hasBody && !isFormData && { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (timeoutSignal.aborted) {
        throw new ApiError('El servidor de Mysic tardó demasiado en responder.', 0)
      }
      throw new ApiError('No se pudo conectar con el servidor de Mysic.', 0)
    }

    const data = response.status === 204 ? null : await response.json().catch(() => null)

    if (!response.ok) {
      throw new ApiError(
        data?.message || data?.detail || 'No se pudo completar la solicitud.',
        response.status,
      )
    }
    return data
  }

  async function run(path, options) {
    const isGet = (options.method ?? 'GET').toUpperCase() === 'GET'
    if (!isGet) return attempt(path, options)

    try {
      return await attempt(path, options)
    } catch (error) {
      const retryable = error instanceof ApiError && (error.status === 0 || RETRYABLE_STATUSES.has(error.status))
      if (!retryable || options.signal?.aborted) throw error
      await sleep(retryDelayMs)
      return attempt(path, options)
    }
  }

  function request(path, options = {}) {
    const isGet = (options.method ?? 'GET').toUpperCase() === 'GET'
    if (!isGet || options.signal) return run(path, options)

    if (!inflight.has(path)) {
      const task = run(path, options).finally(() => inflight.delete(path))
      inflight.set(path, task)
    }
    return inflight.get(path)
  }

  return { request }
}
