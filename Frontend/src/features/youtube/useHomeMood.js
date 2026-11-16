import { useCallback, useEffect, useReducer } from 'react'
import { API_BASE } from './lib/api.js'

const IDLE = { attempt: 0, data: null, filter: null, status: 'idle' }

function reducer(state, event) {
  switch (event.type) {
    case 'start': return { attempt: state.attempt, data: null, filter: event.filter, status: 'loading' }
    case 'success': return event.filter === state.filter ? { ...state, data: event.data, status: 'ready' } : state
    case 'failure': return event.filter === state.filter ? { ...state, status: 'failed' } : state
    case 'retry': return { ...state, attempt: state.attempt + 1 }
    default: return IDLE
  }
}

async function fetchMoodHome(filter, signal) {
  const response = await fetch(`${API_BASE}/home?filter=${encodeURIComponent(filter)}`, { credentials: 'include', signal })
  if (!response.ok) throw new Error(`Error ${response.status}`)
  return response.json()
}

/**
 * Inicio filtrado por una pastilla de estado de ánimo (Relax, Fiesta...): `GET /api/youtube/home?filter=`.
 * Devuelve la misma forma que el Inicio (secciones + `continuation`), así useHomeMore sigue paginándolo.
 * Una respuesta de una pastilla que el usuario ya dejó atrás nunca sustituye a la actual.
 */
export default function useHomeMood(filter) {
  const [state, dispatch] = useReducer(reducer, IDLE)

  useEffect(() => {
    if (!filter) {
      dispatch({ type: 'reset' })
      return undefined
    }
    const controller = new AbortController()
    dispatch({ type: 'start', filter })
    fetchMoodHome(filter, controller.signal)
      .then((data) => { if (!controller.signal.aborted) dispatch({ type: 'success', data, filter }) })
      .catch(() => { if (!controller.signal.aborted) dispatch({ type: 'failure', filter }) })
    return () => controller.abort()
  }, [filter, state.attempt])

  const retry = useCallback(() => dispatch({ type: 'retry' }), [])
  return { data: state.data, retry, status: state.status }
}