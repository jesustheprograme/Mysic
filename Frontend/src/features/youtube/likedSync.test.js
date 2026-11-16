import assert from 'node:assert/strict'
import test from 'node:test'
import { dedupeById, FULL_SYNC_MS, mergeLikedHead, needsFullSync, pageIsKnown } from './likedSync.js'

const songs = (...ids) => ids.map((id) => ({ id }))
const ids = (list) => list.map((song) => song.id).join('')

test('dedupeById quita repetidos y basura conservando el orden', () => {
  assert.equal(ids(dedupeById([...songs('a', 'b', 'a', 'c'), null, { title: 'sin id' }])), 'abc')
})

test('needsFullSync: sin lista completa o con más de un día', () => {
  const now = 10 * FULL_SYNC_MS
  assert.equal(needsFullSync(null, now), true)
  assert.equal(needsFullSync({ complete: false, fullAt: now }, now), true)
  assert.equal(needsFullSync({ complete: true, fullAt: now - 1000 }, now), false)
  assert.equal(needsFullSync({ complete: true, fullAt: now - FULL_SYNC_MS - 1 }, now), true)
})

test('pageIsKnown: solo si todas las canciones de la página ya estaban', () => {
  const known = new Set(['a', 'b'])
  assert.equal(pageIsKnown(songs('a', 'b'), known), true)
  assert.equal(pageIsKnown(songs('a', 'x'), known), false)
  assert.equal(pageIsKnown([], known), false, 'una página vacía no permite concluir nada')
})

test('mergeLikedHead: sin cambios devuelve lo guardado', () => {
  const stored = songs('a', 'b', 'c', 'd', 'e')
  assert.equal(ids(mergeLikedHead(songs('a', 'b'), stored)), 'abcde')
})

test('mergeLikedHead: añadidas arriba y quitadas dentro de la cabecera', () => {
  const stored = songs('a', 'b', 'c', 'd', 'e')
  assert.equal(ids(mergeLikedHead(songs('x', 'y', 'a', 'b'), stored)), 'xyabcde', 'nuevas arriba')
  assert.equal(ids(mergeLikedHead(songs('a', 'c'), stored)), 'acde', 'b se quitó')
  assert.equal(ids(mergeLikedHead(songs('x', 'a', 'a', 'c'), stored)), 'xacde', 'sin repetir')
})

test('mergeLikedHead: si la cabecera no conecta con lo guardado, vale solo lo pedido', () => {
  assert.equal(ids(mergeLikedHead(songs('x', 'y'), songs('a', 'b'))), 'xy')
  assert.equal(ids(mergeLikedHead([], songs('a'))), '')
})
