// Estado de la importación de una playlist de Spotify (el de limusic: vista previa -> encontrando canciones -> listo).
// Vive fuera de los componentes: cerrar el cuadro no la detiene, y la barra lateral muestra cuánto lleva.
//
// Guardado progresivo: la playlist se crea en cuanto hay unas pocas canciones (aparece ya en la barra lateral) y se
// completa al terminar; así, parar a mitad o cerrar la app deja lo encontrado hasta ese momento.
import { useSyncExternalStore } from 'react'
import { spotifyPlaylistDetails } from '../youtube/ytLink.js'
import { fitTracks, runMatching } from './spotifyImportModel.js'

// El servidor admite 32 kB por petición (hasta que se amplíe) y la playlist se guarda entera de una vez.
export const SAFE_BODY_BYTES = 30_000
const FIRST_SAVE_AT = 10
const RECENT_ROWS = 3

const TERMINAL = new Set(['preview', 'done', 'failed', 'cancelled'])

export const IDLE_IMPORT = Object.freeze({
  phase: 'idle', // idle | preview | matching | saving | done | failed | cancelled
  open: false,
  name: '',
  owner: null,
  cover: null,
  total: 0,
  done: 0,
  matched: 0,
  check: 0,
  missing: 0,
  truncated: false,
  recent: [],
  checkList: [],
  missingList: [],
  found: 0,
  saved: null, // { id, updated, count, trimmed }
  message: null,
})

/** Texto y avance del indicador de la barra lateral, o null si no hay importación en marcha o terminada. */
export function importPill(state) {
  if (!state || state.phase === 'idle' || state.phase === 'preview') return null
  if (state.phase === 'matching') return { label: `Importando ${percentOf(state)} %`, percent: percentOf(state) }
  if (state.phase === 'saving') return { label: 'Guardando playlist', percent: 100 }
  if (state.phase === 'done') return { label: 'Importación completada', percent: 100 }
  return { label: 'Importación detenida', percent: percentOf(state) }
}

export const percentOf = (state) => (state.total ? Math.min(100, Math.floor((state.done / state.total) * 100)) : 0)

/** Las canciones no encontradas, una por línea (para copiarlas y buscarlas a mano). */
export const missingText = (state) => state.missingList.map((entry) => [entry.title, entry.artists].filter(Boolean).join(' - ')).join('\n')

export function createSpotifyImport({ runner = runMatching } = {}) {
  let state = IDLE_IMPORT
  const listeners = new Set()
  let preview = null
  let controller = null
  let bridge = { notify: null, play: null, save: null }
  let foundSongs = []

  const publish = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  function openPreview(info) {
    if (state.phase === 'matching' || state.phase === 'saving') {
      publish({ open: true })
      return { busy: true }
    }
    const tracks = (info?.tracks ?? []).filter((track) => track?.title)
    preview = { name: info?.name ?? '', owner: info?.owner ?? null, cover: info?.cover ?? null, tracks, truncated: Boolean(info?.truncated) }
    foundSongs = []
    state = { ...IDLE_IMPORT }
    publish({ phase: 'preview', open: true, name: preview.name, owner: preview.owner, cover: preview.cover, total: tracks.length, truncated: preview.truncated })
    return { busy: false }
  }

  async function start({ search }) {
    if (state.phase !== 'preview' || !preview) return
    const { tracks } = preview
    if (!tracks.length) {
      publish({ phase: 'failed', message: 'Esa lista no tiene canciones que importar.' })
      return
    }
    controller = new AbortController()
    const { signal } = controller
    const partial = new Array(tracks.length)
    const missingList = []
    const checkList = []
    let recent = []
    let counts = { done: 0, matched: 0, check: 0, missing: 0, failed: 0 }
    publish({ phase: 'matching', done: 0, matched: 0, check: 0, missing: 0, found: 0, recent: [], checkList: [], missingList: [], saved: null, message: null })

    const collect = () => partial.filter((entry) => entry?.song).map((entry) => entry.song)
    let chain = Promise.resolve()
    let savedId = null
    let savedInfo = null
    let saveError = false
    const saveNow = () => {
      chain = chain.then(async () => {
        const songs = collect()
        if (!songs.length || !bridge.save) return
        const details = spotifyPlaylistDetails(preview, songs)
        let result = await bridge.save(details, savedId)
        let trimmed = 0
        // Si el servidor no admite una playlist tan grande, se guarda la parte que cabe en vez de perderla entera.
        if (!result && JSON.stringify(details).length > SAFE_BODY_BYTES) {
          const fitted = fitTracks(details.tracks, SAFE_BODY_BYTES - 700)
          if (fitted.length && fitted.length < details.tracks.length) {
            result = await bridge.save({ ...details, tracks: fitted }, savedId)
            if (result) trimmed = details.tracks.length - fitted.length
          }
        }
        if (result) {
          savedId = result.id
          // "Actualizada" = la playlist ya existía antes de esta importación (se decide con la primera escritura; las
          // siguientes solo completan la que acaba de crearse).
          savedInfo = { id: result.id, updated: savedInfo ? savedInfo.updated : Boolean(result.updated), count: details.tracks.length - trimmed, trimmed }
          saveError = false
        } else {
          saveError = true
        }
      })
      return chain
    }

    let firstSaveDone = false
    const onProgress = (entry, index) => {
      partial[index] = entry
      counts = { ...counts, done: counts.done + 1, [entry.tier]: counts[entry.tier] + 1, failed: counts.failed + (entry.failed ? 1 : 0) }
      const artists = (entry.track.artists ?? []).join(', ')
      recent = [{ title: entry.track.title, artists, tier: entry.tier, thumbnail: entry.song?.thumbnail ?? null }, ...recent].slice(0, RECENT_ROWS)
      if (entry.tier === 'missing') missingList.push({ title: entry.track.title, artists })
      if (entry.tier === 'check') checkList.push({ title: entry.track.title, artists, found: entry.song?.title ?? '' })
      publish({ done: counts.done, matched: counts.matched, check: counts.check, missing: counts.missing, found: counts.matched + counts.check, recent, missingList: [...missingList], checkList: [...checkList] })
      if (!firstSaveDone && counts.matched + counts.check >= FIRST_SAVE_AT) {
        firstSaveDone = true
        void saveNow()
      }
    }

    await runner({ onProgress, search, signal, tracks })
    foundSongs = collect()
    const stopped = signal.aborted
    publish({ phase: 'saving' })
    await saveNow()
    controller = null

    let next
    if (!foundSongs.length) {
      next = { phase: stopped ? 'cancelled' : 'failed', message: stopped ? 'Importación detenida antes de encontrar canciones.' : (counts.failed > 0 && counts.failed === counts.done ? 'No se pudo buscar en YouTube Music. Comprueba tu conexión e inténtalo otra vez.' : 'No se encontró ninguna de esas canciones en YouTube Music.') }
    } else if (saveError || !savedInfo) {
      next = { phase: 'failed', message: 'Se encontraron las canciones, pero no se pudo guardar la playlist en tu cuenta.' }
    } else {
      next = { phase: stopped ? 'cancelled' : 'done', saved: savedInfo, message: stopped ? `Importación detenida: se guardaron ${savedInfo.count} canciones.` : null }
    }
    publish({ ...next, found: foundSongs.length })
    if (!state.open) bridge.notify?.(describe(state))
  }

  function describe(current) {
    if (current.phase === 'done') return `Playlist «${current.name}» ${current.saved?.updated ? 'actualizada' : 'creada'}: ${current.saved?.count} de ${current.total} canciones`
    return current.message ?? 'La importación de Spotify se detuvo.'
  }

  return {
    close() {
      if (TERMINAL.has(state.phase)) {
        state = { ...IDLE_IMPORT }
        foundSongs = []
        publish({})
      } else {
        publish({ open: false })
      }
    },
    configure(next) { bridge = { ...bridge, ...next } },
    getState: () => state,
    openPreview,
    playSongs() { if (foundSongs.length) bridge.play?.(foundSongs) },
    reopen() { publish({ open: true }) },
    start,
    stop() { controller?.abort() },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}

/** La importación de la aplicación (una a la vez). */
export const spotifyImport = createSpotifyImport()

export const useSpotifyImport = () => useSyncExternalStore(spotifyImport.subscribe, spotifyImport.getState)
