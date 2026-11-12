import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseLibrary, compactLibrary, isEmptyLibrary, LIBRARY_CACHE_KEY, libraryCacheKey } from './libraryCache.js'

test('la clave de la biblioteca es por usuario y distinta de la antigua, global', () => {
  assert.notEqual(libraryCacheKey('mysic:user:1:youtube'), libraryCacheKey('mysic:user:2:youtube'))
  assert.notEqual(libraryCacheKey('mysic:user:1:youtube'), LIBRARY_CACHE_KEY)
})

test('una respuesta vacía no reemplaza una biblioteca útil; una útil siempre gana', () => {
  const useful = { likedSongs: [{ id: 'a' }], playlists: [] }
  const empty = { likedSongs: [], playlists: [], albums: [], artists: [], subscriptions: [], uploads: [] }
  assert.deepEqual(chooseLibrary(useful, empty), { library: useful, keptPrevious: true })
  assert.deepEqual(chooseLibrary(null, empty), { library: empty, keptPrevious: false }, 'sin nada previo se acepta')
  const fresh = { likedSongs: [], playlists: [{ id: 'PL1' }] }
  assert.equal(chooseLibrary(useful, fresh).library, fresh)
  assert.equal(isEmptyLibrary({ uploads: [{ id: 'x' }] }), false, 'cualquiera de las seis listas cuenta')
  assert.equal(isEmptyLibrary(undefined), true)
})

test('compactLibrary conserva solo los campos de la interfaz en las canciones', () => {
  const compact = compactLibrary({ likedSongs: [{ id: 'a', title: 'T', basura: 'x'.repeat(100) }], albums: [{ id: 'MPRE1' }] })
  assert.deepEqual(compact.likedSongs, [{ id: 'a', title: 'T' }])
  assert.deepEqual(compact.albums, [{ id: 'MPRE1' }])
})