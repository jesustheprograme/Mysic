import assert from 'node:assert/strict'
import test from 'node:test'
import { filterShelves, isBlockedItem, sanitizeBlockList } from './blockList.js'

const view = { artistIds: new Set(['UC1']), songIds: new Set(['s9']) }

test('sanitizeBlockList descarta basura y repetidos', () => {
  assert.deepEqual(sanitizeBlockList({ artists: [{ id: 'UC1', name: 'Ado' }, { id: 'UC1' }, { id: '' }, null], songs: ['a', 'a', 5] }), { artists: [{ id: 'UC1', name: 'Ado' }], songs: ['a'] })
  assert.deepEqual(sanitizeBlockList('x'), { artists: [], songs: [] })
})

test('isBlockedItem: artista bloqueado, sus canciones y álbumes, y canciones con no me gusta', () => {
  assert.equal(isBlockedItem({ kind: 'artist', id: 'UC1' }, view), true)
  assert.equal(isBlockedItem({ kind: 'song', id: 's1', artistId: 'UC1' }, view), true)
  assert.equal(isBlockedItem({ kind: 'album', id: 'MP1', artistId: 'UC1' }, view), true)
  assert.equal(isBlockedItem({ kind: 'song', id: 's9', artistId: 'UC2' }, view), true)
  assert.equal(isBlockedItem({ kind: 'song', id: 's1', artistId: 'UC2' }, view), false)
  assert.equal(isBlockedItem({ kind: 'playlist', id: 's9' }, view), false, 'el no me gusta es solo de canciones')
})

test('filterShelves quita lo bloqueado, borra secciones vacías y no copia si no cambia nada', () => {
  const clean = { title: 'A', items: [{ kind: 'song', id: 's1', artistId: 'UC2' }] }
  const mixed = { title: 'B', items: [{ kind: 'song', id: 's2', artistId: 'UC1' }, { kind: 'song', id: 's3' }] }
  const gone = { title: 'C', items: [{ kind: 'artist', id: 'UC1' }] }
  const out = filterShelves([clean, mixed, gone], view)
  assert.deepEqual(out.map((shelf) => [shelf.title, shelf.items.length]), [['A', 1], ['B', 1]])
  assert.equal(out[0], clean)
  const same = [clean]
  assert.equal(filterShelves(same, view), same)
  assert.equal(filterShelves(same, { artistIds: new Set(), songIds: new Set() }), same)
})
