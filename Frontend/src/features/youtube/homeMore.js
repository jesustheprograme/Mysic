// Carga progresiva del Inicio: las secciones siguientes llegan bajo demanda (GET /api/youtube/home/more?token=).
// Módulo puro (sin red ni React): la petición vive en useHomeMore.js.

export const MAX_MORE_PAGES = 6

/** Une secciones por título; si el título ya existe, suma solo los elementos nuevos (por id). */
export function mergeShelves(existing, incoming) {
  const result = existing.map((shelf) => ({ ...shelf, items: [...shelf.items] }))
  const byTitle = new Map(result.map((shelf) => [shelf.title, shelf]))
  for (const shelf of incoming) {
    const current = byTitle.get(shelf.title)
    if (!current) {
      const copy = { ...shelf, items: [...shelf.items] }
      result.push(copy)
      byTitle.set(copy.title, copy)
      continue
    }
    const ids = new Set(current.items.map((item) => item.id))
    for (const item of shelf.items) if (!ids.has(item.id)) current.items.push(item)
  }
  return result
}

export const initialMoreState = (token = null) => ({ token, shelves: [], pages: 0, status: 'idle', failure: null })

/**
 * idle -> loading -> idle|done|failed. Un fallo detiene la carga automática (sin bucles de reintento);
 * solo un clic explícito (retry) vuelve a intentarlo.
 */
export function moreReducer(state, event) {
  switch (event.type) {
    case 'reset': return initialMoreState(event.token ?? null)
    case 'start': return state.status === 'loading' || !state.token ? state : { ...state, status: 'loading', failure: null }
    case 'success': {
      const pages = state.pages + 1
      const token = pages >= MAX_MORE_PAGES ? null : event.continuation ?? null
      return { token, shelves: mergeShelves(state.shelves, event.shelves), pages, status: token ? 'idle' : 'done', failure: null }
    }
    case 'failure': return { ...state, status: 'failed', failure: event.reason }
    case 'retry': return state.status === 'failed' ? { ...state, status: 'idle', failure: null } : state
    default: return state
  }
}

/** ¿Debe pedirse otra página sin que el usuario haga nada? Solo si está en reposo, hay token y nada falló. */
export const canAutoload = (state) => state.status === 'idle' && Boolean(state.token)
