import assert from 'node:assert/strict'
import test from 'node:test'
import { applyOverview, applyPage, canLoadMore, countLabel, emptyLibrary, emptyMeta, legacyMeta, mergeById, mergeFirstPage, nextKindToLoad, pendingKinds, withError, withLoading } from './libraryPages.js'

const items = (...ids) => ids.map((id) => ({ id }))
const section = (ids, continuation = null) => ({ items: items(...ids), continuation, hasMore: Boolean(continuation) })
const overview = (sections) => ({ sections, errors: [] })

test('mergeById añade lo nuevo al final sin repetir y conserva el orden', () => {
  assert.deepEqual(mergeById(items('a', 'b'), [...items('b', 'c'), { id: null }, ...items('c', 'd')]).map((x) => x.id), ['a', 'b', 'c', 'd'])
})

test('mergeFirstPage pone la página nueva delante y conserva el resto de lo que ya se tenía', () => {
  assert.deepEqual(mergeFirstPage(items('x', 'a', 'b', 'c'), items('n', 'a')).map((x) => x.id), ['n', 'a', 'x', 'b', 'c'])
  assert.deepEqual(mergeFirstPage([], items('a')).map((x) => x.id), ['a'])
})

test('applyOverview rellena listas, cursores y hasMore por categoría', () => {
  const { library, meta } = applyOverview(emptyLibrary(), overview({ albums: section(['a1', 'a2'], 'cur-a'), playlists: section(['p1']), likedSongs: section(['s1'], 'cur-s') }))
  assert.deepEqual(library.albums.map((x) => x.id), ['a1', 'a2'])
  assert.deepEqual([meta.cursors.albums, meta.hasMore.albums, meta.hasMore.playlists, meta.hasMore['liked-songs']], ['cur-a', true, false, true])
  assert.deepEqual(library.artists, [], 'una categoría ausente queda vacía')
})

test('applyOverview conserva lo anterior de una categoría que falló y anota el error', () => {
  const previous = { ...emptyLibrary(), artists: items('guardado1', 'guardado2') }
  const { library, meta } = applyOverview(previous, overview({ artists: { items: [], continuation: null, hasMore: false, error: 'LIBRARY_TIMEOUT' }, albums: section(['a1']) }))
  assert.deepEqual(library.artists.map((x) => x.id), ['guardado1', 'guardado2'])
  assert.equal(meta.errors.artists, 'LIBRARY_TIMEOUT')
  assert.equal(meta.hasMore.artists, undefined)
  assert.equal(canLoadMore(meta, 'artists'), false)
})

test('un cursor ausente aunque hasMore sea true no permite cargar más (sin bucles)', () => {
  const { meta } = applyOverview(emptyLibrary(), overview({ albums: { items: items('a'), continuation: null, hasMore: true } }))
  assert.equal(meta.hasMore.albums, false)
})

test('applyPage añade la página, actualiza el cursor y limpia el error de esa categoría', () => {
  let state = applyOverview(emptyLibrary(), overview({ albums: section(['a1'], 'c1') }))
  state = { library: state.library, meta: withError(state.meta, 'albums', 'LIBRARY_TIMEOUT') }
  assert.equal(canLoadMore(state.meta, 'albums'), false, 'con error no hay carga automática')
  const next = applyPage(state.library, state.meta, 'albums', { items: items('a2', 'a1'), continuation: 'c2', hasMore: true })
  assert.deepEqual(next.library.albums.map((x) => x.id), ['a1', 'a2'])
  assert.deepEqual([next.meta.cursors.albums, next.meta.hasMore.albums, next.meta.errors.albums], ['c2', true, undefined])
  const last = applyPage(next.library, next.meta, 'albums', { items: items('a3'), continuation: null, hasMore: false })
  assert.deepEqual([last.meta.hasMore.albums, canLoadMore(last.meta, 'albums')], [false, false])
})

test('canLoadMore respeta la carga en curso y nextKindToLoad sigue el orden pedido', () => {
  const { meta } = applyOverview(emptyLibrary(), overview({ albums: section(['a'], 'ca'), artists: section(['r'], 'cr'), uploads: section(['u'], 'cu') }))
  assert.equal(nextKindToLoad(meta, ['uploads', 'albums', 'artists']), 'uploads')
  assert.equal(nextKindToLoad(withLoading(meta, 'uploads', true), ['uploads', 'albums', 'artists']), 'albums')
  assert.equal(nextKindToLoad(meta, ['playlists']), null)
  assert.deepEqual(pendingKinds(meta), ['albums', 'artists', 'uploads'])
})

test('el modo anterior (servidor sin páginas) no tiene nada más que pedir', () => {
  const meta = legacyMeta()
  assert.equal(meta.legacy, true)
  assert.equal(nextKindToLoad(meta, ['albums', 'artists']), null)
  assert.equal(pendingKinds(meta).length, 0)
  assert.deepEqual(emptyMeta().hasMore, {})
})

test('countLabel añade + mientras el servidor tenga más', () => {
  assert.equal(countLabel(120, true), '120+')
  assert.equal(countLabel(120, false), '120')
})