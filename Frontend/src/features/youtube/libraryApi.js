// Red de la biblioteca por páginas (GET /api/youtube/library/overview y /library/:kind?cursor=).
import { API_BASE } from './lib/api.js'

async function request(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || `Error ${response.status}`), { code: body.code, status: response.status })
  }
  return response.json()
}

/** Primera página de las seis categorías. Un servidor sin esta ruta responde 404 y se usa /library (todo junto). */
export const fetchLibraryOverview = ({ fresh = false, signal } = {}) => request(`/library/overview${fresh ? '?fresh=1' : ''}`, signal)

/** Una categoría: la primera página o, con cursor, la siguiente. */
export const fetchLibraryPage = (kind, cursor, signal) => request(`/library/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, signal)

/** ¿El servidor no tiene la biblioteca por páginas (versión anterior)? */
export const isUnsupportedLibraryRoute = (error) => error?.status === 404 || error?.status === 405