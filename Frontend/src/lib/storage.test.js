import assert from 'node:assert/strict'
import test from 'node:test'
import { freeStorageSpace, setItemSafe } from './storage.js'

// Almacenamiento falso con cuota en caracteres, como el localStorage real.
function quotaStorage(limit, initial = {}) {
  const data = new Map(Object.entries(initial))
  const used = () => [...data].reduce((total, [key, value]) => total + key.length + value.length, 0)
  return {
    data,
    get length() { return data.size },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem(key, value) {
      const next = used() - (data.has(key) ? key.length + data.get(key).length : 0) + key.length + value.length
      if (next > limit) throw new Error('QuotaExceededError')
      data.set(key, value)
    },
  }
}

test('con sitio guarda sin tocar las cachés', () => {
  const storage = quotaStorage(1000, { 'mysic:cache:v1:youtube-detail:a': 'x'.repeat(100) })
  assert.equal(setItemSafe('mysic:quick-access:v1', '[1]', storage), true)
  assert.equal(storage.data.has('mysic:cache:v1:youtube-detail:a'), true)
})

test('lleno: sacrifica las cachés prescindibles y guarda el dato del usuario', () => {
  const storage = quotaStorage(400, {
    'mysic:cache:v1:youtube-detail:a': 'x'.repeat(150),
    'mysic:cache:v1:youtube-landing:home': 'x'.repeat(100),
    'mysic:user:1:youtube:favorite-songs': 'f'.repeat(40),
  })
  assert.equal(setItemSafe('mysic:quick-access:v1', 'p'.repeat(120), storage), true)
  assert.equal(storage.getItem('mysic:quick-access:v1').length, 120)
  assert.equal(storage.data.has('mysic:cache:v1:youtube-detail:a'), false)
  assert.equal(storage.data.has('mysic:user:1:youtube:favorite-songs'), true, 'los datos del usuario nunca se borran')
})

test('lleno y sin nada que liberar: devuelve false sin lanzar', () => {
  const storage = quotaStorage(100, { 'mysic:user:1:youtube:favorite-songs': 'f'.repeat(60) })
  assert.equal(setItemSafe('otra', 'x'.repeat(80), storage), false)
  assert.equal(freeStorageSpace(storage), 0)
})
