import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFavoriteEntries, serializeFavoriteEntries } from './useYoutubeFavorites.js'

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
