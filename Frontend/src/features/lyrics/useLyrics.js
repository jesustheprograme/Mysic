import { useEffect, useState } from 'react'
import { API_URL } from '../../lib/api.js'

const IDLE = { status: 'idle', lines: [], plain: '' }

/**
 * Carga la letra de una canción desde /api/lyrics solo mientras `enabled` sea true.
 * Cancela la petición al cambiar de canción y espera a conocer la duración,
 * porque el backend empareja por duración para evitar versiones desfasadas.
 */
export function useLyrics({ album, artist, duration, enabled, title }) {
  const [state, setState] = useState(IDLE)

  useEffect(() => {
    if (!enabled || !title || !artist) {
      setState(IDLE)
      return undefined
    }
    if (!(duration > 0)) {
      setState({ status: 'loading', lines: [], plain: '' })
      return undefined
    }

    const controller = new AbortController()
    const params = new URLSearchParams({ title, artist, duration: String(duration) })
    if (album) params.set('album', album)

    setState({ status: 'loading', lines: [], plain: '' })
    fetch(`${API_URL}/lyrics?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (!data.found) return setState({ status: 'empty', lines: [], plain: '' })
        setState({
          status: 'ready',
          lines: Array.isArray(data.synced) ? data.synced : [],
          plain: typeof data.plain === 'string' ? data.plain : '',
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', lines: [], plain: '' })
      })

    return () => controller.abort()
  }, [album, artist, duration, enabled, title])

  return state
}
