import { invoke, isTauri } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { API_URL } from '../../lib/api.js'
import { createLyricsEngine, songKey } from './sources/engine.js'
import { PROVIDERS } from './sources/providers.js'
import { readSongPrefs, subscribeSongPrefs, writeSongPrefs } from './sources/prefs.js'
import { createTranslator } from './sources/translate.js'

const IDLE = { status: 'idle', lines: [], plain: '', provider: null, synced: false }
const desktop = isTauri()

// Peticiones a proveedores desde este equipo (Rust, sin CORS); en la web solo queda LRCLIB vía servidor.
const ctx = {
  http: desktop ? (request) => invoke('lyrics_http', { request }) : () => Promise.reject(new Error('NOT_AVAILABLE')),
  async server(params) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null && value !== 0))
    const response = await fetch(`${API_URL}/lyrics?${query}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
}

/** Una sola instancia: la caché en memoria se comparte entre el controlador y la vista extensa. */
export const lyricsEngine = createLyricsEngine({ ctx })
export const LYRICS_PROVIDERS = desktop ? PROVIDERS : PROVIDERS.filter((provider) => provider.id === 'lrclib')
/** Traducción al español (de la fuente o automática), con caché compartida. Solo en la app de escritorio. */
export const translateLyrics = desktop ? createTranslator({ http: ctx.http, target: 'es' }) : null
const AUTO_ORDER = LYRICS_PROVIDERS.map((provider) => provider.id)

/**
 * Letra de una canción con fuente elegible. Solo trabaja mientras `enabled` sea true. Con la duración los proveedores
 * emparejan mejor (no traen otra versión); sin ella se busca igual y se repite al conocerla.
 * Devuelve el estado de la letra, la petición en curso (para el selector) y las acciones: elegir fuente, desfase y
 * búsqueda por título.
 */
export function useLyrics({ album, artist, duration, enabled, title, videoId }) {
  const baseKey = videoId || (title && artist ? `${title}|${artist}` : '')
  // Preferencias compartidas: el controlador y la vista extensa leen el mismo almacén y se enteran de los cambios.
  const prefs = useSyncExternalStore(subscribeSongPrefs, () => readSongPrefs(baseKey))
  const [search, setSearch] = useState(null)
  const [state, setState] = useState(IDLE)
  const [attempt, setAttempt] = useState(0)

  // La búsqueda manual es de cada canción: se olvida al cambiar.
  const [searchKey, setSearchKey] = useState(baseKey)
  if (searchKey !== baseKey) {
    setSearchKey(baseKey)
    setSearch(null)
  }

  const request = useMemo(() => {
    if (!title || !artist) return null
    return search
      ? { videoId, title: search.title, artist: search.artist, album: undefined, duration, searched: true }
      : { videoId, title, artist, album, duration, searched: false }
  }, [album, artist, duration, search, title, videoId])

  useEffect(() => {
    if (!enabled || !request) { setState(IDLE); return undefined }
    // Sin duración (canción restaurada en pausa: se conoce al cargar el audio) también se busca; al llegar la
    // duración la petición cambia de clave y se repite con ella.
    let cancelled = false
    const cached = prefs.source ? lyricsEngine.fromProvider(prefs.source, request) : lyricsEngine.auto(request, AUTO_ORDER)
    setState((current) => ({ ...current, status: 'loading' }))
    cached
      .then((result) => {
        if (cancelled) return
        setState(result
          ? { status: 'ready', lines: result.synced ? result.lines : [], plain: result.plain, provider: result.provider, synced: result.synced }
          : { ...IDLE, status: 'empty', provider: prefs.source })
      })
      .catch(() => { if (!cancelled) setState({ ...IDLE, status: 'error', provider: prefs.source }) })
    return () => { cancelled = true }
  }, [attempt, enabled, prefs.source, request])

  const update = useCallback((patch) => writeSongPrefs(baseKey, patch), [baseKey])

  return {
    ...state,
    offset: prefs.offset,
    pinnedSource: prefs.source,
    request,
    search,
    songKey: request ? songKey(request) : '',
    chooseSource: (source) => update({ source }),
    setOffset: (offset) => update({ offset }),
    runSearch: (next) => setSearch(next?.title?.trim() ? { title: next.title.trim(), artist: (next.artist || '').trim() } : null),
    retry: () => setAttempt((value) => value + 1),
  }
}
