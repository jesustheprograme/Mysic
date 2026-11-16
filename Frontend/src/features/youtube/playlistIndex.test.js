import assert from 'node:assert/strict'
import test from 'node:test'
import { authorOf, indexEntry, INDEX_MAX_AGE_MS, membership, needsRefresh, personalPlaylists, pickOwner } from './playlistIndex.js'

const library = [
  { id: 'LM', title: 'Liked Music', description: 'Auto playlist', itemCount: 0 },
  { id: 'PL1', title: 'Coleccion 05', description: 'The adventurer • 46 tracks', itemCount: 46 },
  { id: 'PL2', title: 'city pop', description: 'The adventurer • 31 tracks', itemCount: 31 },
  { id: 'PL3', title: 'Q2000', description: 'Q2000 • 8 tracks', itemCount: 2000 },
  { id: 'PL4', title: 'otra', description: 'Joey • 129 tracks', itemCount: 129 },
]

test('el dueño es el autor más repetido (al menos dos listas) y solo sus listas son personales', () => {
  assert.equal(authorOf(library[1]), 'The adventurer')
  assert.equal(pickOwner(library), 'The adventurer')
  assert.deepEqual(personalPlaylists(library, 'The adventurer').map((p) => p.id), ['PL1', 'PL2'])
  assert.equal(pickOwner([library[3], library[4]]), null, 'sin un autor repetido no se adivina')
  assert.deepEqual(personalPlaylists(library, null), [])
})

test('needsRefresh: nueva, con otro número de pistas o vieja', () => {
  const now = 10 * INDEX_MAX_AGE_MS
  const entry = { count: 46, indexedAt: now - 1000 }
  assert.equal(needsRefresh(undefined, library[1], now), true)
  assert.equal(needsRefresh(entry, library[1], now), false)
  assert.equal(needsRefresh(entry, { ...library[1], itemCount: 47 }, now), true)
  assert.equal(needsRefresh({ ...entry, indexedAt: now - INDEX_MAX_AGE_MS - 1 }, library[1], now), true)
})

test('indexEntry: la primera vez no inventa fechas; después fecha lo nuevo y conserva lo anterior', () => {
  const first = indexEntry(undefined, library[1], ['a', 'b'], 100)
  assert.deepEqual(first.added, {}, 'lo que ya estaba no tiene fecha')
  assert.equal(first.author, 'The adventurer')
  const second = indexEntry(first, library[1], ['c', 'a', 'b'], 200)
  assert.deepEqual(second.added, { c: 200 })
  const third = indexEntry(second, library[1], ['c', 'a', 'd'], 300)
  assert.deepEqual(third.added, { c: 200, d: 300 }, 'b se quitó; c conserva su fecha')
  assert.deepEqual(third.songIds, ['c', 'a', 'd'])
})

test('membership: canción → listas, sin la entrada de Me gusta', () => {
  const map = membership({
    PL1: { id: 'PL1', songIds: ['a', 'b'] },
    PL2: { id: 'PL2', songIds: ['b'] },
    liked: { id: 'liked', songIds: ['a'] },
  })
  assert.deepEqual(map.get('a').map((e) => e.id), ['PL1'])
  assert.deepEqual(map.get('b').map((e) => e.id), ['PL1', 'PL2'])
  assert.equal(map.get('z'), undefined)
})
