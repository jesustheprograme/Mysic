import assert from 'node:assert/strict'
import test from 'node:test'
import { groupQueue } from './queueGroups.js'

const queue = [
  { id: '1', artist: 'Mitski', artistId: 'UC1', album: 'Be the Cowboy', albumId: 'MPRE1', artwork: 'a.jpg' },
  { id: '2', artist: 'Beach House', artistId: 'UC2', album: 'Bloom', albumId: 'MPRE2', artwork: 'b.jpg' },
  { id: '3', artist: 'Mitski', artistId: 'UC1', album: 'Be the Cowboy', albumId: 'MPRE1', artwork: 'c.jpg' },
  { id: '4', artist: 'Artista desconocido', artistId: null, album: '', artwork: 'd.jpg' },
  { id: '5', artist: 'beach house', artistId: null, album: { id: 'cat-9', title: 'Propio' }, artwork: 'e.jpg' },
]

test('groupQueue artist: orden de aparición, cuenta y sin "Artista desconocido"', () => {
  const groups = groupQueue(queue, 'artist')
  assert.deepEqual(groups.map((g) => [g.title, g.id, g.count, g.firstIndex]), [
    ['Mitski', 'UC1', 2, 0],
    ['Beach House', 'UC2', 1, 1],
    // Sin id se agrupa por nombre: no se mezcla con el que sí tiene id.
    ['beach house', null, 1, 4],
  ])
  assert.equal(groups[0].artwork, 'a.jpg')
})

test('groupQueue album: texto u objeto, con el artista como subtítulo y sin álbumes vacíos', () => {
  const groups = groupQueue(queue, 'album')
  assert.deepEqual(groups.map((g) => [g.title, g.id, g.count, g.subtitle]), [
    ['Be the Cowboy', 'MPRE1', 2, 'Mitski'],
    ['Bloom', 'MPRE2', 1, 'Beach House'],
    ['Propio', 'cat-9', 1, 'beach house'],
  ])
})

test('groupQueue album: "Sencillo" sin id es relleno; sin id se distingue por artista', () => {
  const groups = groupQueue([
    { id: 'v1', artist: 'A', album: 'Sencillo', albumId: null },
    { id: 'v2', artist: 'B', album: 'Sencillo', albumId: null },
    { id: 's1', artist: 'A', album: 'Greatest Hits', albumId: null },
    { id: 's2', artist: 'B', album: 'Greatest Hits', albumId: null },
    { id: 's3', artist: 'C', album: 'Sencillo', albumId: 'MPRE7' },
  ], 'album')
  assert.deepEqual(groups.map((g) => [g.title, g.subtitle, g.id]), [
    ['Greatest Hits', 'A', null],
    ['Greatest Hits', 'B', null],
    // Con id es un álbum real aunque se llame así.
    ['Sencillo', 'C', 'MPRE7'],
  ])
})

test('groupQueue: cola vacía o ausente', () => {
  assert.deepEqual(groupQueue([], 'artist'), [])
  assert.deepEqual(groupQueue(undefined, 'album'), [])
})
