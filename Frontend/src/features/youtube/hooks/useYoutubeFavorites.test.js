import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeFavoriteEntries, parseFavoriteEntries, serializeFavoriteEntries } from './useYoutubeFavorites.js'

test('migra IDs antiguos y conserva metadatos de favoritos globales', () => {
  const song = { id: 'song-2', title: 'Canción global', source: 'youtube' }
  const entries = parseFavoriteEntries(['song-1', song, null, { title: 'sin id' }])

  assert.deepEqual([...entries.keys()], ['song-1', 'song-2'])
  assert.equal(entries.get('song-1'), null)
  assert.deepEqual(entries.get('song-2'), song)
  assert.deepEqual(serializeFavoriteEntries(entries), ['song-1', song])
})

test('descarta valores de almacenamiento inválidos', () => {
  assert.equal(parseFavoriteEntries(null).size, 0)
  assert.equal(parseFavoriteEntries({ id: 'song-1' }).size, 0)
})

test('mergeFavoriteEntries añade solo lo nuevo y conserva la referencia si no hay cambios', () => {
  const current = parseFavoriteEntries([{ id: 'a', title: 'A' }])
  assert.equal(mergeFavoriteEntries(current, [{ id: 'a', title: 'A' }, null, { title: 'sin id' }]), current)

  const next = mergeFavoriteEntries(current, [{ id: 'a' }, { id: 'b' }, { id: 'b' }, { id: 'c' }])
  assert.notEqual(next, current)
  assert.deepEqual([...next.keys()], ['a', 'b', 'c'])
  assert.equal(current.size, 1)
})

test('mergeFavoriteEntries procesa miles de canciones en una pasada', () => {
  const songs = Array.from({ length: 5000 }, (_, index) => ({ id: `v${index}`, title: `Canción ${index}` }))
  const started = performance.now()
  const merged = mergeFavoriteEntries(new Map(), songs)
  assert.equal(merged.size, 5000)
  assert.ok(performance.now() - started < 250)
})