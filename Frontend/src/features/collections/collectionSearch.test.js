import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSongs } from './collectionSearch.js'

const songs = [
  { id: 'a', title: 'Psicodélicos', artist: 'Los Flakos', album: 'Los Flakos' },
  { id: 'b', title: 'Nora', artist: 'Los Flakos', albumTitle: 'Álbum Verde' },
  { id: 'c', title: 'El Ritmo', artist: 'Otra Banda' },
]

test('sin consulta devuelve la misma lista', () => {
  assert.equal(filterSongs(songs, ''), songs)
  assert.equal(filterSongs(songs, '   '), songs)
})

test('ignora mayúsculas y acentos', () => {
  assert.deepEqual(filterSongs(songs, 'PSICODELICOS').map((song) => song.id), ['a'])
  assert.deepEqual(filterSongs(songs, 'album verde').map((song) => song.id), ['b'])
})

test('todas las palabras deben coincidir, en cualquier campo', () => {
  assert.deepEqual(filterSongs(songs, 'flakos nora').map((song) => song.id), ['b'])
  assert.deepEqual(filterSongs(songs, 'flakos').map((song) => song.id), ['a', 'b'])
  assert.deepEqual(filterSongs(songs, 'zzz'), [])
})

test('tolera canciones sin artista ni álbum', () => {
  assert.deepEqual(filterSongs([{ id: 'x', title: 'Solo título' }], 'solo').map((song) => song.id), ['x'])
})
