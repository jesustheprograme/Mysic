import assert from 'node:assert/strict'
import test from 'node:test'
import { createPersistedCache } from '../../lib/persistedCache.js'
import { createDetailCache, DETAIL_POLICY } from './detailCache.js'

function makeStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }
}
function setup({ start = 1_000_000, fetcher } = {}) {
  let current = start
  const storage = makeStorage()
  const calls = []
  const fetch = fetcher ?? (async (path) => ({ path, n: calls.length }))
  const wrapped = async (path) => { calls.push(path); return fetch(path) }
  const persisted = createPersistedCache({ storage, now: () => current })
  const cache = createDetailCache({ fetcher: wrapped, now: () => current, persisted })
  return { cache, calls, storage, persisted, advance: (ms) => { current += ms }, reload: () => createDetailCache({ fetcher: wrapped, now: () => current, persisted }) }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('la precarga y el clic comparten una sola petición en vuelo', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { cache, calls } = setup({ fetcher: async (path) => { await gate; return { path } } })
  const prefetch = cache.get('album', 'A1', '/album/A1')
  const click = cache.get('album', 'A1', '/album/A1', new AbortController().signal)
  release()
  const [first, second] = await Promise.all([prefetch, click])
  assert.equal(first, second)
  assert.equal(calls.length, 1)
})

test('dentro de la frescura se responde sin red', async () => {
  const { cache, calls, advance } = setup()
  await cache.get('album', 'A1', '/album/A1')
  advance(DETAIL_POLICY.album.freshMs - 1)
  await cache.get('album', 'A1', '/album/A1')
  assert.equal(calls.length, 1)
})

test('caducado pero usable: responde al instante con lo guardado y actualiza por detrás', async () => {
  let version = 1
  const { cache, calls, advance } = setup({ fetcher: async () => ({ version }) })
  assert.equal((await cache.get('playlist', 'P1', '/playlist/P1')).version, 1)
  advance(DETAIL_POLICY.playlist.freshMs + 1)
  version = 2
  assert.equal((await cache.get('playlist', 'P1', '/playlist/P1')).version, 1, 'esta apertura ve lo guardado')
  await tick()
  assert.equal(calls.length, 2, 'se pidió por detrás')
  assert.equal((await cache.get('playlist', 'P1', '/playlist/P1')).version, 2, 'la siguiente ya ve lo nuevo')
})

test('pasada la ventana usable se espera a la red; si falla, se usa lo viejo guardado', async () => {
  let fail = false
  const { cache, advance } = setup({ fetcher: async () => { if (fail) throw new Error('sin red'); return { ok: true } } })
  await cache.get('playlist', 'P1', '/playlist/P1')
  advance(DETAIL_POLICY.playlist.staleMs + 1)
  fail = true
  assert.deepEqual(await cache.get('playlist', 'P1', '/playlist/P1'), { ok: true }, 'sin red: lo último guardado')
  const empty = setup({ fetcher: async () => { throw new Error('sin red') } })
  await assert.rejects(empty.cache.get('album', 'X', '/album/X'), /sin red/)
})

test('sobrevive a un reinicio (lee del disco) y no pide mientras sea fresco', async () => {
  const { cache, reload, calls } = setup()
  await cache.get('artist', 'AR1', '/artist/AR1')
  const next = reload()
  const data = await next.get('artist', 'AR1', '/artist/AR1')
  assert.equal(data.path, '/artist/AR1')
  assert.equal(calls.length, 1)
})

test('cada alcance guarda lo suyo y clearScope borra memoria, disco y lo que venía en vuelo', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let slow = false
  const { cache, calls, reload } = setup({ fetcher: async (path) => { if (slow) await gate; return { path } } })
  cache.setScope('u1|p')
  await cache.get('album', 'A1', '/album/A1')
  cache.setScope('u2|p')
  await cache.get('album', 'A1', '/album/A1')
  assert.equal(calls.length, 2, 'otro usuario no ve lo de este')
  cache.clearScope('u1|p')
  cache.setScope('u1|p')
  await cache.get('album', 'A1', '/album/A1')
  assert.equal(calls.length, 3, 'borrado: se pide de nuevo')
  slow = true
  const pending = cache.get('album', 'A2', '/album/A2')
  cache.clearScope('u1|p')
  release()
  await pending
  assert.equal(reload().size, 0)
  cache.setScope('u1|p')
  slow = false
  await cache.get('album', 'A2', '/album/A2')
  assert.equal(calls.length, 5, 'la respuesta tardía de antes del borrado no se guardó')
})

test('abortar suelta a quien esperaba pero no cancela la petición compartida', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { cache, calls } = setup({ fetcher: async () => { await gate; return { ok: 1 } } })
  const controller = new AbortController()
  const waiting = cache.get('album', 'A1', '/album/A1', controller.signal)
  const other = cache.get('album', 'A1', '/album/A1')
  controller.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  release()
  assert.deepEqual(await other, { ok: 1 })
  assert.equal(calls.length, 1)
  await assert.rejects(cache.get('album', 'A9', '/album/A9', AbortSignal.abort()), { name: 'AbortError' })
})

test('lo guardado en disco está acotado: no crece sin límite', async () => {
  const { cache, storage } = setup()
  for (let index = 0; index < 100; index += 1) await cache.get('album', `A${index}`, `/album/A${index}`)
  const detailKeys = [...storage.map.keys()].filter((key) => key.includes('youtube-detail:') && !key.endsWith('index'))
  assert.ok(detailKeys.length <= 80, `${detailKeys.length} entradas`)
})
