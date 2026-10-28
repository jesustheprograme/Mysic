import assert from 'node:assert/strict'
import test from 'node:test'
import { getPlaybackQueue } from './navegacionDescubrimiento.js'

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
