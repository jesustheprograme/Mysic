// Estado de la cuenta de YouTube Music en el cliente: una máquina de estados pequeña y pura.
//
//   unknown       todavía no hay una lectura fiable (arranque en frío). No se muestra nada de vinculación.
//   connected     hay una vinculación conocida (instantánea guardada o confirmada por el servidor).
//   degraded      había vinculación y la revalidación falló (red, tiempo agotado, 5xx): se conserva el último
//                 estado y los datos, con un aviso y reintento. NUNCA se trata como cuenta nueva.
//   disconnected  el servidor confirmó que no hay credenciales: único caso, junto a expired, en que se ofrece vincular.
//   expired       el servidor confirmó que YouTube revocó la sesión.
//
// Solo se guarda en el equipo una instantánea NO sensible ({ connected, personalized }) por usuario de Mysic.
import { readStorage, writeStorage } from './lib/storage.js'

export const ACCOUNT_STATUS = Object.freeze({
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired',
  UNKNOWN: 'unknown',
})

const CONNECTED_FALLBACK = Object.freeze({ connected: true, personalized: true, status: 'connected' })
export const SERVER_DEGRADED_NOTICE_MS = 2 * 60 * 1000

const SNAPSHOT_SUFFIX = ':account-snapshot'
export const accountSnapshotKey = (prefix) => `${prefix}${SNAPSHOT_SUFFIX}`

/** Lee la instantánea guardada; ignora cualquier valor que no sea exactamente una cuenta conectada. */
export function readAccountSnapshot(prefix, read = readStorage) {
  const stored = read(accountSnapshotKey(prefix), null)
  return stored?.connected === true ? { connected: true, personalized: stored.personalized !== false } : null
}

/** Guarda solo lo no sensible: nunca cookies, tokens ni cabeceras. */
export function writeAccountSnapshot(prefix, account, write = writeStorage) {
  write(accountSnapshotKey(prefix), account?.connected ? { connected: true, personalized: account.personalized !== false } : null)
}

export function initialAccountState(snapshot) {
  return snapshot?.connected
    ? { status: ACCOUNT_STATUS.CONNECTED, account: { ...CONNECTED_FALLBACK, personalized: snapshot.personalized !== false }, degradedReason: null, degradedSince: null, failures: 0, fromSnapshot: true }
    : { status: ACCOUNT_STATUS.UNKNOWN, account: null, degradedReason: null, degradedSince: null, failures: 0, fromSnapshot: false }
}

/**
 * Eventos:
 *   { type: 'loaded', account }  respuesta del servidor
 *   { type: 'failed' }           la lectura falló (red, tiempo agotado, 5xx)
 *   { type: 'set', account }     resultado de una acción explícita del usuario (vincular, desvincular)
 */
export function reduceAccount(state, event) {
  if (event.type === 'failed') {
    const failures = state.failures + 1
    if (state.status === ACCOUNT_STATUS.CONNECTED || state.status === ACCOUNT_STATUS.DEGRADED) {
      return { ...state, status: ACCOUNT_STATUS.DEGRADED, degradedReason: 'request', degradedSince: event.now ?? Date.now(), failures }
    }
    // Sin lectura previa fiable no se inventa nada; con una confirmación de desconexión tampoco se cambia.
    return { ...state, failures }
  }

  const account = event.account
  if (!account || typeof account !== 'object') return state
  if (account.connected && account.health === 'degraded') {
    const continuing = state.status === ACCOUNT_STATUS.DEGRADED && state.degradedReason === 'server'
    return { status: ACCOUNT_STATUS.DEGRADED, account, degradedReason: 'server', degradedSince: continuing ? state.degradedSince : (event.now ?? Date.now()), failures: 0, fromSnapshot: false }
  }
  if (account.connected) return { status: ACCOUNT_STATUS.CONNECTED, account, degradedReason: null, degradedSince: null, failures: 0, fromSnapshot: false }
  if (account.expired === true) return { status: ACCOUNT_STATUS.EXPIRED, account, degradedReason: null, degradedSince: null, failures: 0, fromSnapshot: false }
  return { status: ACCOUNT_STATUS.DISCONNECTED, account, degradedReason: null, degradedSince: null, failures: 0, fromSnapshot: false }
}

/** La cuenta tal como la consume la interfaz: null mientras se desconoce; connected:true también en degradado. */
export const accountForView = (state) => (state.status === ACCOUNT_STATUS.UNKNOWN ? null : state.account)

/** Solo una desconexión o una expiración confirmadas pueden mostrar el flujo de vincular. */
export const shouldOfferLink = (state) => state.status === ACCOUNT_STATUS.DISCONNECTED || state.status === ACCOUNT_STATUS.EXPIRED

/** Los fallos de petición se avisan al instante; `health: degraded` solo si persiste dos minutos. */
export function shouldShowAccountNotice(state, now = Date.now()) {
  if (state.status !== ACCOUNT_STATUS.DEGRADED) return false
  if (state.degradedReason !== 'server') return true
  return now - state.degradedSince >= SERVER_DEGRADED_NOTICE_MS
}

/** Espera antes de reintentar la lectura de la cuenta: 1 s, 3 s, 8 s, 20 s y 30 s como máximo. */
export const accountRetryDelay = (failures) => [1000, 3000, 8000, 20_000][Math.min(Math.max(failures, 1), 4) - 1] ?? 30_000

/** ¿Hay que volver a mirar pronto? El servidor aún no verificó la sesión (la comprueba en segundo plano). */
export const needsRecheck = (account) => Boolean(account?.connected) && account.health != null && account.health !== 'ok'
