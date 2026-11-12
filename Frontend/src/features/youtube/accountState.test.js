import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_STATUS, SERVER_DEGRADED_NOTICE_MS, accountForView, accountRetryDelay, initialAccountState, needsRecheck, readAccountSnapshot, reduceAccount, shouldOfferLink, shouldShowAccountNotice, writeAccountSnapshot } from './accountState.js'

const connected = { connected: true, personalized: true, status: 'connected', health: 'ok' }
const run = (state, ...events) => events.reduce(reduceAccount, state)

test('sin instantánea el arranque es unknown y no ofrece vincular', () => {
  const state = initialAccountState(null)
  assert.equal(state.status, ACCOUNT_STATUS.UNKNOWN)
  assert.equal(accountForView(state), null)
  assert.equal(shouldOfferLink(state), false)
})

test('con instantánea conectada el arranque es connected desde el primer fotograma', () => {
  const state = initialAccountState({ connected: true, personalized: true })
  assert.equal(state.status, ACCOUNT_STATUS.CONNECTED)
  assert.equal(accountForView(state).connected, true)
  assert.equal(shouldOfferLink(state), false)
})

test('unknown -> connected al confirmarlo el servidor', () => {
  const state = run(initialAccountState(null), { type: 'loaded', account: connected })
  assert.equal(state.status, ACCOUNT_STATUS.CONNECTED)
  assert.equal(accountForView(state), connected)
})

test('un error transitorio sobre connected conserva la cuenta (degraded) y nunca ofrece vincular', () => {
  let state = initialAccountState({ connected: true })
  for (let index = 0; index < 4; index += 1) {
    state = run(state, { type: 'failed' })
    assert.equal(state.status, ACCOUNT_STATUS.DEGRADED)
    assert.equal(accountForView(state).connected, true, 'la interfaz sigue viendo una cuenta conectada')
    assert.equal(shouldOfferLink(state), false)
  }
  assert.equal(state.failures, 4)
  assert.equal(shouldShowAccountNotice(state), true)
  assert.equal(run(state, { type: 'loaded', account: connected }).status, ACCOUNT_STATUS.CONNECTED, 'se recupera al responder el servidor')
})

test('health degraded conserva la cuenta y solo muestra el aviso si dura dos minutos', () => {
  const startedAt = 50_000
  const degraded = run(initialAccountState({ connected: true }), {
    type: 'loaded',
    account: { ...connected, health: 'degraded' },
    now: startedAt,
  })
  assert.equal(degraded.status, ACCOUNT_STATUS.DEGRADED)
  assert.equal(accountForView(degraded).connected, true)
  assert.equal(shouldOfferLink(degraded), false)
  assert.equal(shouldShowAccountNotice(degraded, startedAt + SERVER_DEGRADED_NOTICE_MS - 1), false)
  assert.equal(shouldShowAccountNotice(degraded, startedAt + SERVER_DEGRADED_NOTICE_MS), true)

  const repeated = run(degraded, { type: 'loaded', account: { ...connected, health: 'degraded' }, now: startedAt + 60_000 })
  assert.equal(repeated.degradedSince, startedAt, 'una lectura degradada posterior no reinicia el plazo')
  assert.equal(run(repeated, { type: 'loaded', account: connected }).status, ACCOUNT_STATUS.CONNECTED)
})

test('fallar en unknown no inventa una cuenta nueva', () => {
  const state = run(initialAccountState(null), { type: 'failed' }, { type: 'failed' })
  assert.equal(state.status, ACCOUNT_STATUS.UNKNOWN)
  assert.equal(accountForView(state), null)
  assert.equal(shouldOfferLink(state), false)
})

test('disconnected confirmado ofrece vincular y un fallo posterior no cambia nada', () => {
  const state = run(initialAccountState(null), { type: 'loaded', account: { connected: false, status: 'disconnected' } })
  assert.equal(state.status, ACCOUNT_STATUS.DISCONNECTED)
  assert.equal(shouldOfferLink(state), true)
  assert.equal(run(state, { type: 'failed' }).status, ACCOUNT_STATUS.DISCONNECTED)
})

test('expired confirmado ofrece vincular; un error de vinculación sin expired no es expiración', () => {
  const expired = run(initialAccountState({ connected: true }), { type: 'loaded', account: { connected: false, status: 'error', expired: true } })
  assert.equal(expired.status, ACCOUNT_STATUS.EXPIRED)
  assert.equal(shouldOfferLink(expired), true)
  const linkError = run(initialAccountState(null), { type: 'loaded', account: { connected: false, status: 'error', error: 'El código venció' } })
  assert.equal(linkError.status, ACCOUNT_STATUS.DISCONNECTED)
})

test('una acción explícita (set) sustituye el estado; un valor inválido se ignora', () => {
  const state = initialAccountState({ connected: true })
  assert.equal(run(state, { type: 'set', account: { connected: false, status: 'disconnected' } }).status, ACCOUNT_STATUS.DISCONNECTED)
  assert.equal(run(state, { type: 'set', account: null }), state)
})

test('la instantánea solo guarda lo no sensible y solo si está conectada', () => {
  const store = new Map()
  const write = (key, value) => (value == null ? store.delete(key) : store.set(key, value))
  const read = (key, fallback) => store.get(key) ?? fallback
  writeAccountSnapshot('mysic:user:1:youtube', { connected: true, personalized: true, cookie: 'SECRETO', token: 'x', userCode: 'ABC' }, write)
  assert.deepEqual([...store.values()], [{ connected: true, personalized: true }])
  assert.deepEqual(readAccountSnapshot('mysic:user:1:youtube', read), { connected: true, personalized: true })
  assert.equal(readAccountSnapshot('mysic:user:2:youtube', read), null, 'otro usuario no la ve')
  writeAccountSnapshot('mysic:user:1:youtube', { connected: false }, write)
  assert.equal(readAccountSnapshot('mysic:user:1:youtube', read), null)
  assert.equal(readAccountSnapshot('p', () => ({ connected: 'true' })), null, 'un valor manipulado no cuenta')
})

test('reintentos con espera creciente y tope', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(accountRetryDelay), [1000, 3000, 8000, 20_000, 20_000, 20_000])
})

test('needsRecheck solo cuando el servidor aún no verificó la sesión', () => {
  assert.equal(needsRecheck({ connected: true, health: 'unverified' }), true)
  assert.equal(needsRecheck({ connected: true, health: 'degraded' }), true)
  assert.equal(needsRecheck({ connected: true, health: 'ok' }), false)
  assert.equal(needsRecheck({ connected: true }), false)
  assert.equal(needsRecheck({ connected: false, health: 'ok' }), false)
})
