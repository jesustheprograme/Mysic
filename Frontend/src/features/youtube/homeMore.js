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

/**
 * Las secciones de `live` más las de `carried` cuyo título no vino esta vez. YouTube reparte el Inicio distinto en
 * cada petición (hoy trae "Vuelve a escucharlo", mañana no): lo ya visto no debe desaparecer al volver al Inicio.
 * Las de `live` ganan siempre (son las recientes); las conservadas se acotan para que la lista no crezca sin fin.
 */
export function carryMissing(live, carried, max = 30) {
  const titles = new Set(live.map((shelf) => shelf.title))
  const kept = carried.filter((shelf) => !titles.has(shelf.title))
  return [...live, ...kept].slice(0, Math.max(max, live.length))
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
    // Fin del Inicio: no hay más páginas aunque YouTube anunciara otra (ver isEndOfFeed). Sin aviso ni reintento.
    case 'end': return { ...state, token: null, status: 'done', failure: null }
    case 'retry': return state.status === 'failed' ? { ...state, status: 'idle', failure: null } : state
    default: return state
  }
}

/**
 * ¿Este fallo es en realidad el final del Inicio? Medido (3 de 3 rondas, 2026-11-16): YouTube anuncia una página más
 * tras la cuarta, pero pedirla falla siempre (502 HOME_MORE_FAILED, también al reintentar). Con páginas ya cargadas,
 * un 502 es el final y no un error que mostrar. Un 504 (tiempo agotado) o un fallo en la primera página sí son errores.
 */
export const isEndOfFeed = ({ pages, status }) => status === 502 && pages > 0

/** ¿Merece la pena repetir la petición con el mismo token? Solo ante fallos pasajeros (servidor ocupado o lento). */
export const isTransientFailure = ({ pages, status }) => status === 503 || status === 504 || (status === 502 && pages === 0)

/** ¿Debe pedirse otra página sin que el usuario haga nada? Solo si está en reposo, hay token y nada falló. */
export const canAutoload = (state) => state.status === 'idle' && Boolean(state.token)
