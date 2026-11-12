// Audio de YouTube resuelto en el equipo del usuario (src-tauri/src/resolver.rs): lógica pura.
// La interfaz pone como fuente del <audio> `mysicstream://<videoId>` (en Windows `http://mysicstream.localhost/<id>`);
// si falla, cae al servidor (`/stream/:id`).

export const DIRECT_FLAG_KEY = 'mysic:direct-audio'
export const CLIENT_CONFIG_KEY = 'mysic:client-config'
export const CLIENT_CONFIG_TTL_MS = 24 * 60 * 60 * 1000

const hasControlCharacter = (text) => [...text].some((character) => { const code = character.charCodeAt(0); return code < 32 || code === 127 })

const FIELDS = ['clientName', 'clientVersion', 'clientId', 'osName', 'osVersion', 'deviceMake', 'deviceModel', 'userAgent', 'platform']
// Errores que indican que ESE vídeo no se puede resolver aquí (que lo decida el servidor); un fallo de red no bloquea.
const VIDEO_SPECIFIC_ERRORS = new Set(['UNAVAILABLE', 'LOGIN_REQUIRED', 'NO_AUDIO'])

/**
 * ¿Se usa la ruta directa? Solo en la app de escritorio y salvo que se desactive a mano con
 * `localStorage['mysic:direct-audio'] = '0'` (escape por si YouTube cambia algo y hay que volver al servidor).
 */
export function directAudioEnabled({ flag, isDesktop }) {
  return Boolean(isDesktop) && flag !== '0'
}

/** URL de la fuente directa. `base` es lo que devuelve `convertFileSrc(id, 'mysicstream')`. */
export function isDirectSource(src, videoId) {
  if (!src || !videoId) return false
  const path = String(src).split(/[?#]/)[0]
  return /^(https?:\/\/mysicstream\.localhost|mysicstream:\/\/[^/]*)\//.test(path) && path.endsWith(`/${videoId}`)
}

/** ¿Este error de resolución hace que ese vídeo deje de intentarse en directo? */
export function shouldBlockDirect(code) {
  return VIDEO_SPECIFIC_ERRORS.has(code)
}

/**
 * Perfil de cliente remoto (`client-config.json`): `{ "version": 1, "client": { ... } }`. Solo se aceptan los campos
 * conocidos, como texto corto, imprimible y no vacío; cualquier otra cosa devuelve null y se usa el perfil por defecto.
 */
export function normalizeClientConfig(json) {
  const client = json && typeof json === 'object' ? json.client : null
  if (!client || typeof client !== 'object' || json.version !== 1) return null
  const result = {}
  for (const field of FIELDS) {
    const value = client[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.trim() || value.length > 300 || hasControlCharacter(value)) return null
    result[field] = value
  }
  if (result.clientId !== undefined && !/^\d+$/.test(result.clientId)) return null
  return Object.keys(result).length ? result : null
}

/** Copia guardada del perfil: sirve mientras tenga menos de `CLIENT_CONFIG_TTL_MS`. */
export function freshStoredConfig(stored, now = Date.now()) {
  if (!stored || typeof stored.savedAt !== 'number' || now - stored.savedAt >= CLIENT_CONFIG_TTL_MS || now < stored.savedAt) return null
  return normalizeClientConfig({ version: 1, client: stored.client })
}
