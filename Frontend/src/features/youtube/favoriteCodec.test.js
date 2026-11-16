import assert from 'node:assert/strict'
import test from 'node:test'
import { compactStoredFavorites, hasLegacyFavorites, packFavorite, packFavorites, unpackFavorite, unpackFavorites } from './favoriteCodec.js'

const song = {
  album: 'Alba', albumId: 'MPREb_1', albumTitle: 'Alba', artist: 'Ado', artistId: 'UC1', artwork: 'https://lh3/x=w120', duration: '3:05',
  durationSeconds: 185, id: 'vid1', kind: 'song', source: 'youtube', thumbnail: 'https://lh3/x=w120', title: 'Canción', trackNo: 4,
}

test('ida y vuelta sin pérdida, con los campos duplicados reconstruidos', () => {
  const packed = packFavorite(song)
  assert.ok(Array.isArray(packed))
  assert.deepEqual(unpackFavorite(packed), song)
  assert.ok(JSON.stringify(packed).length < JSON.stringify(song).length / 2, 'ocupa menos de la mitad')
})

test('canciones incompletas: se recortan los huecos del final y no se inventan campos', () => {
  assert.deepEqual(packFavorite({ id: 'a', title: 'T' }), ['a', 'T'])
  assert.deepEqual(unpackFavorite(['a', 'T']), { id: 'a', kind: 'song', source: 'youtube', title: 'T' })
  assert.deepEqual(packFavorite({ id: 'a', artwork: 'c.jpg', albumTitle: 'Alba' }), ['a', null, null, null, 'Alba', null, 'c.jpg'])
})

test('los ids sueltos y la basura no se tocan', () => {
  assert.deepEqual(packFavorites(['id1', song, null]), ['id1', packFavorite(song), null])
  assert.deepEqual(unpackFavorites(['id1', packFavorite(song), [], null]), ['id1', song])
  assert.equal(unpackFavorites('x'), 'x')
})

test('compactStoredFavorites encoge solo las claves de canciones en formato antiguo', () => {
  const data = new Map([
    ['mysic:user:1:youtube:favorite-songs', JSON.stringify([song, 'id2'])],
    ['mysic:user:2:youtube:favorite-songs', JSON.stringify([packFavorite(song)])],
    ['mysic:user:1:youtube:favorite-albums', JSON.stringify([{ id: 'MP1', title: 'A' }])],
    ['mysic:user:3:youtube:favorite-songs', '{roto'],
  ])
  const storage = { get length() { return data.size }, getItem: (key) => data.get(key) ?? null, key: (index) => [...data.keys()][index], setItem: (key, value) => data.set(key, value) }
  const before = data.get('mysic:user:1:youtube:favorite-albums')
  assert.equal(compactStoredFavorites(storage), 1)
  assert.equal(hasLegacyFavorites(JSON.parse(data.get('mysic:user:1:youtube:favorite-songs'))), false)
  assert.deepEqual(unpackFavorites(JSON.parse(data.get('mysic:user:1:youtube:favorite-songs'))), [song, 'id2'])
  assert.equal(data.get('mysic:user:1:youtube:favorite-albums'), before, 'los álbumes favoritos no se tocan')
  assert.equal(compactStoredFavorites(storage), 0, 'la segunda vez no hay nada que hacer')
})
