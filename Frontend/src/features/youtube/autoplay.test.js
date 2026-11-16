import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTOPLAY_KEY, freshSongs, MAX_QUEUE, needsTopUp, readAutoplay, writeAutoplay } from './autoplay.js'

const song = (id, title = `T${id}`, artist = 'A') => ({ id, title, artist })

test('pide más canciones solo cuando queda poco por delante', () => {
  assert.equal(needsTopUp({ currentIndex: 0, queueLength: 1 }), true, 'una sola canción: radio inmediata')
  assert.equal(needsTopUp({ currentIndex: 0, queueLength: 3 }), true)
  assert.equal(needsTopUp({ currentIndex: 0, queueLength: 4 }), false)
  assert.equal(needsTopUp({ currentIndex: 7, queueLength: 10 }), true)
  assert.equal(needsTopUp({ currentIndex: -1, queueLength: 5 }), false, 'sin nada sonando no se pide')
  assert.equal(needsTopUp({ currentIndex: 0, queueLength: 0 }), false)
  assert.equal(needsTopUp({ currentIndex: MAX_QUEUE - 1, queueLength: MAX_QUEUE }), false, 'la cola tiene tope')
})

test('freshSongs descarta lo ya en la cola (por id y por titulo+artista) y los repetidos', () => {
  const queue = [song('a'), song('b', 'Otro', 'Artista')]
  const radio = [song('a'), song('c', 'otro', 'ARTISTA'), song('d'), song('d'), song('e'), null, { title: 'sin id' }]
  assert.deepEqual(freshSongs(radio, queue).map((entry) => entry.id), ['d', 'e'])
})

test('freshSongs respeta el limite y tolera una radio vacia', () => {
  const radio = Array.from({ length: 50 }, (_, index) => song(`r${index}`))
  assert.equal(freshSongs(radio, [], 5).length, 5)
  assert.deepEqual(freshSongs(undefined, []), [])
})

test('la preferencia esta activada por defecto y un almacenamiento roto no lanza', () => {
  const data = {}
  const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value } }
  assert.equal(readAutoplay(storage), true)
  writeAutoplay(false, storage)
  assert.equal(data[AUTOPLAY_KEY], '0')
  assert.equal(readAutoplay(storage), false)
  writeAutoplay(true, storage)
  assert.equal(readAutoplay(storage), true)
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
  assert.equal(readAutoplay(broken), true)
  assert.doesNotThrow(() => writeAutoplay(false, broken))
})