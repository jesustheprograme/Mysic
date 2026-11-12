import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countText,
  EMPTY_LIBRARY_SUMMARY,
  LIBRARY_SUMMARY_EVENT,
  publishLibrarySummary,
  readLibrarySummary,
  sameLibrarySummary,
  summarizeLibrary,
} from './librarySummary.js'

const library = {
  likedSongs: [{ id: 'a', thumbnail: 'https://x/a' }, { id: 'b' }],
  playlists: [
    { id: 'LM', title: 'Música que me gusta', itemCount: 2 }, // la lista de Me gusta de YouTube no se repite como playlist
    { id: 'VLLM', title: 'Liked', itemCount: 2 },
    { id: 'PL1', title: 'Mi playlist', itemCount: 12, thumbnail: 'https://x/p1' },
    { id: 'PL2', itemCount: 'x' },
    { title: 'sin id' },
  ],
}

test('summarizeLibrary: Me gusta aparte, playlists sin la lista LM y con valores por defecto', () => {
  const summary = summarizeLibrary(library, { likedHasMore: true })
  assert.deepEqual(summary.liked, { count: 2, hasMore: true, thumbnail: 'https://x/a' })
  assert.deepEqual(summary.playlists, [
    { count: 12, id: 'PL1', thumbnail: 'https://x/p1', title: 'Mi playlist' },
    { count: 0, id: 'PL2', thumbnail: null, title: 'Playlist' },
  ])
})

test('summarizeLibrary: una biblioteca vacía o ausente da el resumen vacío (la barra lateral no muestra nada)', () => {
  assert.equal(summarizeLibrary(null), EMPTY_LIBRARY_SUMMARY)
  assert.equal(summarizeLibrary({ likedSongs: [], playlists: [] }), EMPTY_LIBRARY_SUMMARY)
  assert.equal(summarizeLibrary({ playlists: [{ id: 'LM' }] }), EMPTY_LIBRARY_SUMMARY)
})

test('sameLibrarySummary: detecta cambios de conteo, portada, orden y playlists', () => {
  const base = summarizeLibrary(library)
  assert.equal(sameLibrarySummary(base, summarizeLibrary(library)), true)
  assert.equal(sameLibrarySummary(base, summarizeLibrary({ ...library, likedSongs: [...library.likedSongs, { id: 'c' }] })), false)
  assert.equal(sameLibrarySummary(base, summarizeLibrary(library, { likedHasMore: true })), false)
  assert.equal(sameLibrarySummary(base, summarizeLibrary({ ...library, playlists: library.playlists.slice(0, 3) })), false)
  assert.equal(sameLibrarySummary(base, summarizeLibrary({ ...library, playlists: [...library.playlists].reverse() })), false)
  assert.equal(sameLibrarySummary(base, null), false)
})

test('publishLibrarySummary: avisa solo cuando cambia y conserva el último', () => {
  const events = []
  const target = { dispatchEvent: (event) => events.push(event) }
  const first = summarizeLibrary(library)
  assert.equal(publishLibrarySummary(first, target), true)
  assert.equal(publishLibrarySummary(summarizeLibrary(library), target), false, 'igual: no se repite')
  assert.equal(events.length, 1)
  assert.equal(events[0].type, LIBRARY_SUMMARY_EVENT)
  assert.equal(events[0].detail, first)
  assert.equal(readLibrarySummary(), first)
  assert.equal(publishLibrarySummary(EMPTY_LIBRARY_SUMMARY, target), true, 'al desvincular se vacía')
  assert.equal(readLibrarySummary(), EMPTY_LIBRARY_SUMMARY)
})

test('countText: singular, plural y conteo parcial', () => {
  assert.equal(countText(1), '1 canción')
  assert.equal(countText(0), '0 canciones')
  assert.equal(countText(2074), '2074 canciones')
  assert.equal(countText(100, true), '100+ canciones')
})
