import assert from 'node:assert/strict'
import test from 'node:test'
import { getPlaybackQueue, resolvePlaybackSongs } from './navegacionDescubrimiento.js'

const songs = [
  { id: 'first', title: 'Primera' },
  { id: 'second', title: 'Segunda' },
  { id: 'third', title: 'Tercera' },
]

test('la cola conserva la lista completa y su orden al avanzar', () => {
  assert.deepEqual(getPlaybackQueue(songs, 'first'), songs)
  assert.deepEqual(getPlaybackQueue(songs, 'second'), songs)
})

test('la cola queda vacía cuando no hay una canción activa válida', () => {
  assert.deepEqual(getPlaybackQueue(songs, null), [])
  assert.deepEqual(getPlaybackQueue(songs, 'missing'), [])
})

test('recupera el contexto de la playlist al restaurar una canción', () => {
  const catalogSongs = [...songs, { id: 'outside', title: 'Fuera de la playlist' }]

  assert.deepEqual(resolvePlaybackSongs(catalogSongs, [], songs, 'second'), songs)
  assert.deepEqual(resolvePlaybackSongs(catalogSongs, [], songs, 'outside'), catalogSongs)
})

test('mantiene el contexto de reproducción establecido al avanzar', () => {
  const contextSongs = [songs[1], songs[2]]

  assert.deepEqual(resolvePlaybackSongs(songs, contextSongs, [], 'third'), contextSongs)
})
