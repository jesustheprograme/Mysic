const assert = require('node:assert/strict')
const test = require('node:test')
const { createTtlCache } = require('./ttl-cache')

test('reutiliza el valor y deduplica cargas concurrentes', async () => {
  const cache = createTtlCache({ ttlMs: 1000 })
  let loads = 0
  const load = async () => { loads += 1; return 'valor' }

  const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)])
  assert.equal(a, 'valor')
  assert.equal(b, 'valor')
  assert.equal(await cache.getOrLoad('k', load), 'valor')
  assert.equal(loads, 1)
})

test('expira por TTL', async () => {
  let time = 0
  const cache = createTtlCache({ ttlMs: 10, now: () => time })
  let loads = 0
  const load = async () => { loads += 1; return loads }

  assert.equal(await cache.getOrLoad('k', load), 1)
  time = 9
  assert.equal(await cache.getOrLoad('k', load), 1)
  time = 10
  assert.equal(await cache.getOrLoad('k', load), 2)
})

test('expulsa el menos usado al superar maxSize', () => {
  const cache = createTtlCache({ ttlMs: 1000, maxSize: 2 })
  cache.set('a', 1)
  cache.set('b', 2)
  cache.get('a')
  cache.set('c', 3)
  assert.equal(cache.get('b'), undefined)
  assert.equal(cache.get('a'), 1)
  assert.equal(cache.get('c'), 3)
  assert.equal(cache.size, 2)
})

test('no cachea null ni errores y permite reintentar', async () => {
  const cache = createTtlCache({ ttlMs: 1000 })
  let calls = 0

  assert.equal(await cache.getOrLoad('k', async () => { calls += 1; return null }), null)
  await assert.rejects(cache.getOrLoad('k', async () => { calls += 1; throw new Error('fallo') }), /fallo/)
  assert.equal(await cache.getOrLoad('k', async () => { calls += 1; return 'ok' }), 'ok')
  assert.equal(calls, 3)
})

test('delete invalida una clave y rechaza un TTL inválido', async () => {
  const cache = createTtlCache({ ttlMs: 1000 })
  cache.set('k', 'v')
  cache.delete('k')
  assert.equal(cache.get('k'), undefined)
  assert.throws(() => createTtlCache({ ttlMs: 0 }), /ttlMs/)
})
