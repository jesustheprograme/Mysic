import assert from 'node:assert/strict'
import test from 'node:test'
import { rememberSaved, targetChanges, targetsErrorMessage, withLibraryArt, withRemembered, youtubeVideoIdOf } from './youtubeTargets.js'

test('youtubeVideoIdOf: canciones de YouTube sí, del catálogo propio no', () => {
  assert.equal(youtubeVideoIdOf({ id: 'dQw4w9WgXcQ', source: 'youtube' }), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoIdOf({ id: 'dQw4w9WgXcQ' }), 'dQw4w9WgXcQ', 'sin audio propio: es de YouTube')
  assert.equal(youtubeVideoIdOf({ id: 'x', videoId: 'dQw4w9WgXcQ' }), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoIdOf({ id: 'abcdefghijk', audioUrl: '/media/a.mp3' }), null, 'canción del catálogo de Mysic')
  assert.equal(youtubeVideoIdOf({ id: 'cancion-local-1' }), null)
  assert.equal(youtubeVideoIdOf(null), null)
})

test('withLibraryArt: portada y número de canciones de la biblioteca, con o sin prefijo VL', () => {
  const targets = [{ id: 'LM', title: 'Liked Music', contains: false }, { id: 'PL1', title: 'city pop', contains: false }, { id: 'PL2', title: 'nueva', contains: true }]
  const library = [{ id: 'VLPL1', thumbnail: 'a.jpg', count: 31 }]
  assert.deepEqual(withLibraryArt(targets, library), [
    { id: 'PL1', title: 'city pop', contains: false, thumbnail: 'a.jpg', count: 31 },
    { id: 'PL2', title: 'nueva', contains: true, thumbnail: null, count: null },
  ])
})

test('targetChanges: solo lo que cambió (añadir lo marcado nuevo, quitar lo desmarcado)', () => {
  const targets = [{ id: 'A', contains: true }, { id: 'B', contains: false }, { id: 'C', contains: false }]
  assert.deepEqual(targetChanges(targets, new Set(['A', 'C'])), [{ id: 'C', add: true }])
  assert.deepEqual(targetChanges(targets, new Set(['B'])), [{ id: 'A', add: false }, { id: 'B', add: true }])
  assert.deepEqual(targetChanges(targets, new Set(['A'])), [], 'sin cambios no se llama a YouTube')
})

test('rememberSaved: lo guardado en la sesión sale marcado al reabrir y se puede quitar', () => {
  const targets = [{ id: 'PLa', contains: false }, { id: 'PLb', contains: false }]
  assert.deepEqual(withRemembered(targets, 'video000001'), targets, 'sin nada guardado no cambia')
  rememberSaved('video000001', 'VLPLa', true)
  const reopened = withRemembered(targets, 'video000001')
  assert.deepEqual(reopened.map((target) => target.contains), [true, false])
  assert.deepEqual(withRemembered(targets, 'video000002').map((target) => target.contains), [false, false], 'es por canción')
  // Desmarcarla ahora genera un "quitar"; tras quitarla vuelve a salir sin marcar.
  assert.deepEqual(targetChanges(reopened, new Set()), [{ id: 'PLa', add: false }])
  rememberSaved('video000001', 'PLa', false)
  assert.deepEqual(withRemembered(targets, 'video000001').map((target) => target.contains), [false, false])
})

test('targetsErrorMessage: sin cuenta, servidor sin la ruta, playlist ajena y otros', () => {
  assert.match(targetsErrorMessage({ status: 409 }), /Vincula/)
  assert.match(targetsErrorMessage({ status: 404 }), /aún no permite/)
  assert.match(targetsErrorMessage({ status: 403 }), /No puedes modificar/)
  assert.equal(targetsErrorMessage({ status: 502, message: 'YouTube caído' }), 'YouTube caído')
})
