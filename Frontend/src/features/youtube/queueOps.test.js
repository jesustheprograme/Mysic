import assert from 'node:assert/strict'
import test from 'node:test'
import { insertIntoQueue, shareUrl, shuffled } from './queueOps.js'

const song = (id) => ({ id })
const ids = (queue) => queue.map((entry) => entry.id)

test('a continuación: entra justo después de la que suena y no cambia su índice', () => {
  const queue = [song('a'), song('b'), song('c')]
  const result = insertIntoQueue(queue, 1, [song('x'), song('y')], { next: true })
  assert.deepEqual(ids(result.queue), ['a', 'b', 'x', 'y', 'c'])
  assert.equal(result.index, 1)
})

test('a la cola: entra al final', () => {
  const result = insertIntoQueue([song('a'), song('b')], 0, [song('x')])
  assert.deepEqual(ids(result.queue), ['a', 'b', 'x'])
  assert.equal(result.index, 0)
})

test('una canción ya en la cola se mueve y el índice de la actual se corrige', () => {
  const queue = [song('a'), song('b'), song('c'), song('d')]
  // 'a' está antes de la actual ('c'): al moverla, la actual pasa del índice 2 al 1.
  const result = insertIntoQueue(queue, 2, [song('a')], { next: true })
  assert.deepEqual(ids(result.queue), ['b', 'c', 'a', 'd'])
  assert.equal(result.index, 1)
  assert.equal(result.queue[result.index].id, 'c')
})

test('la canción que suena no se duplica y los repetidos se ignoran', () => {
  const queue = [song('a'), song('b')]
  assert.equal(insertIntoQueue(queue, 0, [song('a')]).queue, queue)
  const result = insertIntoQueue(queue, 0, [song('x'), song('x'), { title: 'sin id' }])
  assert.deepEqual(ids(result.queue), ['a', 'b', 'x'])
})

test('con la cola vacía las canciones forman la cola sin canción actual', () => {
  const result = insertIntoQueue([], -1, [song('x'), song('y')], { next: true })
  assert.deepEqual(ids(result.queue), ['x', 'y'])
  assert.equal(result.index, -1)
})

test('enlaces para compartir', () => {
  assert.equal(shareUrl('song', 'abc'), 'https://music.youtube.com/watch?v=abc')
  assert.equal(shareUrl('playlist', 'PL1'), 'https://music.youtube.com/playlist?list=PL1')
  assert.equal(shareUrl('album', 'MPREb_1'), 'https://music.youtube.com/browse/MPREb_1')
  assert.equal(shareUrl('desconocido', 'x'), '')
  assert.equal(shareUrl('song', ''), '')
})

test('shuffled devuelve una permutación sin tocar la original', () => {
  const original = [1, 2, 3, 4, 5]
  const result = shuffled(original, () => 0)
  assert.deepEqual(original, [1, 2, 3, 4, 5])
  assert.deepEqual([...result].sort(), [1, 2, 3, 4, 5])
  assert.notDeepEqual(result, original)
})
