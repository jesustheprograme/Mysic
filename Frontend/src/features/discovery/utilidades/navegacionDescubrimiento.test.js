import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPlaybackQueue,
  getPlaybackTrackKey,
  getRelativePlaybackSong,
  resolvePlaybackSongs,
} from './navegacionDescubrimiento.js'

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

test('distingue canciones locales y globales con el mismo id al avanzar', () => {
  const mixedSongs = [
    { id: 'same', source: 'local' },
    { id: 'same', source: 'youtube' },
    { id: 'last', source: 'local' },
  ]

  assert.equal(getPlaybackTrackKey(mixedSongs[0]), 'local:same')
  assert.equal(getPlaybackTrackKey(mixedSongs[1]), 'youtube:same')
  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[0], 1), mixedSongs[1])
  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[1], 1), mixedSongs[2])
})

test('la navegación mixta conserva el orden y vuelve al inicio', () => {
  const mixedSongs = [
    { id: 'local-1', source: 'local' },
    { id: 'global-1', source: 'youtube' },
    { id: 'local-2', source: 'local' },
  ]

  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[0], 1), mixedSongs[1])
  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[1], 1), mixedSongs[2])
  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[2], 1), mixedSongs[0])
  assert.equal(getRelativePlaybackSong(mixedSongs, mixedSongs[0], -1), mixedSongs[2])
})

import { DEFAULT_SECTION, sectionHashes as hashesForDefault } from './navegacionDescubrimiento.js'

test('la seccion por defecto es YouTube Music y tiene una ruta valida', () => {
  assert.equal(DEFAULT_SECTION, 'youtube')
  assert.equal(hashesForDefault[DEFAULT_SECTION], '#/youtube')
})
