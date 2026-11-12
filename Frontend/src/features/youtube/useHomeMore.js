import { useCallback, useEffect, useReducer, useRef } from 'react'
import { canAutoload, initialMoreState, moreReducer } from './homeMore.js'
import { API_BASE } from './lib/api.js'

async function fetchHomeMore(token, signal) {
  const response = await fetch(`${API_BASE}/home/more?token=${encodeURIComponent(token)}`, { credentials: 'include', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || `Error ${response.status}`), { status: response.status, code: body.code })
  }
  return response.json()
}

/**
 * Páginas siguientes del Inicio. `resetKey` cambia cuando llega una primera página nueva (con su token), que
 * reinicia la carga. Un fallo detiene la carga automática; `loadMore` (el botón "Reintentar") la reanuda.
 */
export default function useHomeMore({ enabled, resetKey, token }) {
  const [state, dispatch] = useReducer(moreReducer, null, () => initialMoreState(null))
  const stateRef = useRef(state)
  stateRef.current = state
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    dispatch({ type: 'reset', token: enabled ? token : null })
    return () => abortRef.current?.abort()
  }, [enabled, resetKey, token])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    if (current.status === 'loading' || !current.token) return
    dispatch({ type: 'start' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const body = await fetchHomeMore(current.token, controller.signal)
      if (controller.signal.aborted) return
      dispatch({ type: 'success', shelves: body.shelves ?? [], continuation: body.continuation })
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return
      dispatch({ type: 'failure', reason: error.status === 410 ? 'expired' : 'error' })
    }
  }, [])

  return { autoload: canAutoload(state), failure: state.failure, hasMore: Boolean(state.token) || state.status === 'loading', loadMore, loading: state.status === 'loading', pages: state.pages, shelves: state.shelves, status: state.status }
}