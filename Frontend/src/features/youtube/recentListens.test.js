import assert from 'node:assert/strict'
import test from 'node:test'
import { addRecent, compactRecent, mergeListenAgain, RECENT_LIMIT, sanitizeRecents, withListenAgain } from './recentListens.js'

const song = (id) => ({ kind: 'song', id, title: `S${id}` })

test('compactRecent guarda solo lo necesario y descarta tipos o entradas inválidas', () => {
  assert.deepEqual(compactRecent('song', { id: 'a', title: 'T', artwork: 'c.jpg', albumTitle: 'Alba', basura: 1 }), { kind: 'song', id: 'a', title: 'T', album: 'Alba', thumbnail: 'c.jpg' })
  assert.equal(compactRecent('artist', { id: 'UC1', title: 'Ado' }), null)
  assert.equal(compactRecent('album', { id: 'MP1' }), null, 'sin título no sirve')
})

test('addRecent sube lo repetido al principio y recorta', () => {
  let entries = addRecent([], song('a'), 1)
  entries = addRecent(entries, song('b'), 2)
  entries = addRecent(entries, song('a'), 3)
  assert.deepEqual(entries.map((entry) => [entry.id, entry.at]), [['a', 3], ['b', 2]])
  const many = Array.from({ length: RECENT_LIMIT + 10 }, (_, i) => song(`x${i}`)).reduce((list, item, i) => addRecent(list, item, i), [])
  assert.equal(many.length, RECENT_LIMIT)
  assert.equal(addRecent(entries, null), entries)
})

test('mergeListenAgain: lo local primero, sin artistas, sin repetir y sin los accesos directos', () => {
  const local = [song('a'), { kind: 'album', id: 'MP1', title: 'Alba' }]
  const remote = [song('a'), { kind: 'artist', id: 'UC1', name: 'Ado' }, { kind: 'playlist', id: 'PL1', title: 'Zumba' }, { kind: 'playlist', id: 'PL2', title: 'Fijada' }]
  const merged = mergeListenAgain(local, remote, { exclude: ['playlist:PL2'] })
  assert.deepEqual(merged.map((entry) => `${entry.kind}:${entry.id}`), ['song:a', 'album:MP1', 'playlist:PL1'])
  assert.equal(mergeListenAgain(local, remote, { limit: 1 }).length, 1)
})

test('withListenAgain reemplaza el bloque de YouTube o lo añade si no vino', () => {
  const shelves = [{ title: 'Quick picks', items: [song('q')] }, { title: 'Listen again', items: [song('r')] }]
  const replaced = withListenAgain(shelves, [song('a')])
  assert.deepEqual(replaced[1].items.map((entry) => entry.id), ['a', 'r'])
  assert.equal(replaced[0], shelves[0], 'las demás secciones no se tocan')
  const added = withListenAgain([shelves[0]], [song('a')])
  assert.deepEqual(added.map((shelf) => shelf.title), ['Listen again', 'Quick picks'])
  assert.equal(withListenAgain(shelves, []), shelves, 'sin escuchas no cambia nada')
})

test('sanitizeRecents tolera basura', () => {
  assert.deepEqual(sanitizeRecents('x'), [])
  assert.equal(sanitizeRecents([song('a'), song('a'), { kind: 'artist', id: 'u', title: 'n' }, null]).length, 1)
})
