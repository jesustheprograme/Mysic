import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { API_URL } from '../../lib/api.js'
import { readStorage, writeStorage } from './lib/storage.js'
import {
  CLIENT_CONFIG_KEY,
  DIRECT_FLAG_KEY,
  directAudioEnabled,
  freshStoredConfig,
  normalizeClientConfig,
  shouldBlockDirect,
} from './directAudioModel.js'

// Puente con src-tauri/src/resolver.rs. Todo es opcional: sin la app de escritorio (o si algo falla) el reproductor
// usa el servidor como antes.

const WARM_TTL_MS = 4 * 60_000
const WARM_LIMIT = 40
const warmed = new Map() // videoId -> { at, request }
const blocked = new Set() // vídeos que no se pueden resolver aquí: que los resuelva el servidor
let initPromise

const inDesktop = () => typeof window !== 'undefined'
  && (isTauri() || Boolean(window.__TAURI_INTERNALS__))
  && !window.__MYSIC_MINI_PLAYER__

export function directAudioAvailable() {
  let flag
  try {
    flag = window.localStorage?.getItem(DIRECT_FLAG_KEY)
  } catch {
    flag = undefined
  }
  return directAudioEnabled({ flag, isDesktop: inDesktop() })
}

export const directAudioUrl = (id) => convertFileSrc(id, 'mysicstream')
export const isDirectBlocked = (id) => blocked.has(id)

/** Resuelve y deja en la caché nativa la URL de un vídeo (~80 ms). Las llamadas repetidas comparten el resultado. */
export function warmDirect(id) {
  if (!id || !directAudioAvailable()) return Promise.resolve(null)
  const now = Date.now()
  for (const [key, entry] of warmed) if (now - entry.at > WARM_TTL_MS) warmed.delete(key)
  let entry = warmed.get(id)
  if (!entry) {
    const request = invoke('resolve_audio', { videoId: id }).catch((code) => {
      warmed.delete(id)
      if (shouldBlockDirect(String(code))) blocked.add(id)
      throw code
    })
    request.catch(() => {})
    entry = { at: now, request }
    warmed.set(id, entry)
    while (warmed.size > WARM_LIMIT) warmed.delete(warmed.keys().next().value)
  }
  return entry.request
}

/** Olvida lo resuelto de un vídeo (la fuente falló): la siguiente vez se pide de nuevo. */
export function forgetDirect(id) {
  warmed.delete(id)
  invoke('forget_audio', { videoId: id }).catch(() => {})
}

async function loadClientConfig() {
  const stored = freshStoredConfig(readStorage(CLIENT_CONFIG_KEY, null))
  if (stored) return stored
  try {
    const base = /^https?:/i.test(API_URL) ? new URL(API_URL).origin : ''
    const response = await fetch(`${base}/client-config.json`, { cache: 'no-cache' })
    if (!response.ok) return null
    const config = normalizeClientConfig(await response.json())
    if (config) writeStorage(CLIENT_CONFIG_KEY, { client: config, savedAt: Date.now() })
    return config
  } catch {
    return null // sin archivo (servidor antiguo) o sin red: perfil por defecto de la aplicación
  }
}

/** Una vez por ejecución: aplica el perfil de cliente remoto y prepara el visitante de YouTube por adelantado. */
export function initDirectAudio() {
  if (!directAudioAvailable()) return Promise.resolve(false)
  initPromise ??= (async () => {
    const config = await loadClientConfig()
    if (config) await invoke('set_client_config', { config }).catch(() => {})
    await invoke('warm_resolver').catch(() => {})
    return true
  })()
  return initPromise
}
