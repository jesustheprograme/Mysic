import assert from 'node:assert/strict'
import test from 'node:test'
import { createPersistedCache } from './persistedCache.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

test('guarda y recupera datos con prefijo', () => {
  const storage = memoryStorage()
  const cache = createPersistedCache({ storage, prefix: 'p:' })

  assert.equal(cache.write('songs', [{ id: 1 }]), true)
  assert.deepEqual(cache.read('songs'), [{ id: 1 }])
  assert.ok(storage.data.has('p:songs'))
  assert.equal(cache.read('otra'), null)
})

test('descarta entradas caducadas', () => {
  let time = 1000
  const storage = memoryStorage()
  const cache = createPersistedCache({ storage, prefix: 'p:', maxAgeMs: 100, now: () => time })

  cache.write('k', 'valor')
  time = 1100
  assert.equal(cache.read('k'), 'valor')
  time = 1101
  assert.equal(cache.read('k'), null)
  assert.equal(storage.data.has('p:k'), false)
})

test('no guarda datos demasiado grandes y elimina el valor anterior', () => {
  const storage = memoryStorage()
  const cache = createPersistedCache({ storage, prefix: 'p:', maxBytes: 50 })

  assert.equal(cache.write('k', 'a'), true)
  assert.equal(cache.write('k', 'x'.repeat(200)), false)
  assert.equal(cache.read('k'), null)
})

test('tolera JSON dañado, cuota llena y ausencia de almacenamiento', () => {
  const corrupt = memoryStorage({ 'p:k': '{no es json' })
  assert.equal(createPersistedCache({ storage: corrupt, prefix: 'p:' }).read('k'), null)

  const full = {
    getItem: () => null,
    removeItem: () => {},
    setItem: () => { throw new Error('QuotaExceededError') },
  }
  assert.equal(createPersistedCache({ storage: full, prefix: 'p:' }).write('k', 1), false)

  const none = createPersistedCache({ storage: null })
  assert.equal(none.read('k'), null)
  assert.equal(none.write('k', 1), false)
  assert.doesNotThrow(() => none.remove('k'))
})

test('remove borra la entrada', () => {
  const cache = createPersistedCache({ storage: memoryStorage(), prefix: 'p:' })
  cache.write('k', 1)
  cache.remove('k')
  assert.equal(cache.read('k'), null)
})
