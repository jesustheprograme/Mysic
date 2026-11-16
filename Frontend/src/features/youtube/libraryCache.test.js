import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseLibrary, compactLibrary, isEmptyLibrary, LIBRARY_CACHE_KEY, libraryCacheKey, persistLibrary, trimLibrary, TRIMMED_LIKED_LIMIT, withoutTrimMark } from './libraryCache.js'

test('si la biblioteca no cabe entera se guarda la versión reducida con el total real', () => {
  const liked = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, title: 'x'.repeat(50) }))
  const stored = new Map()
  const cache = { write: (key, data) => (JSON.stringify(data).length > 40_000 ? false : (stored.set(key, data), true)) }
  assert.equal(persistLibrary(cache, 'k', { likedSongs: liked, playlists: [{ id: 'PL1' }] }), true)
  const saved = stored.get('k')
  assert.equal(saved.likedSongs.length, TRIMMED_LIKED_LIMIT)
  assert.equal(saved.likedTotal, 1000)
  assert.deepEqual(saved.playlists, [{ id: 'PL1' }], 'las playlists siempre se conservan')
  assert.equal(withoutTrimMark(saved).likedTotal, undefined)
  assert.equal(trimLibrary({ likedSongs: [{ id: 'a' }] }).likedTotal, undefined, 'lo pequeño no se recorta')
})

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