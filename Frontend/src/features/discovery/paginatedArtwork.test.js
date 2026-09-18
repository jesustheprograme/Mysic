import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdjacentArtworkUrls, getVisiblePages } from './paginatedArtwork.js'

const songs = Array.from({ length: 90 }, (_, index) => ({ artwork: `cover-${Math.floor(index / 2)}` }))

test('la navegación muestra la página actual y las vecinas existentes', () => {
  assert.deepEqual(getVisiblePages(0, 6), [0, 1])
  assert.deepEqual(getVisiblePages(4, 6), [3, 4, 5])
  assert.deepEqual(getVisiblePages(4, 5), [3, 4])
})

test('en la primera página prepara únicamente la segunda', () => {
  assert.deepEqual(getAdjacentArtworkUrls(songs, 0, 15, 6),
    [...new Set(songs.slice(15, 30).map((song) => song.artwork))])
})

test('en la quinta página prepara la cuarta y la sexta sin repetir portadas', () => {
  const expected = [...new Set([...songs.slice(45, 60), ...songs.slice(75, 90)].map((song) => song.artwork))]
  assert.deepEqual(getAdjacentArtworkUrls(songs, 4, 15, 6), expected)
})

test('no prepara páginas fuera del límite de la paginación', () => {
  assert.deepEqual(getAdjacentArtworkUrls(songs, 4, 15, 5),
    [...new Set(songs.slice(45, 60).map((song) => song.artwork))])
})
