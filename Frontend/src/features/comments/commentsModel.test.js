import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLikes, formatTotal, mergeComments, translatePublished } from './commentsModel.js'

test('translatePublished: fechas relativas de YouTube en español', () => {
  assert.equal(translatePublished('6 years ago (edited)'), 'hace 6 años (editado)')
  assert.equal(translatePublished('1 year ago'), 'hace 1 año')
  assert.equal(translatePublished('3 weeks ago'), 'hace 3 semanas')
  assert.equal(translatePublished('1 month ago'), 'hace 1 mes')
  assert.equal(translatePublished('hace 2 días'), 'hace 2 días')
  assert.equal(translatePublished(undefined), '')
})

test('formatLikes: contadores abreviados', () => {
  assert.equal(formatLikes('429K'), '429 K')
  assert.equal(formatLikes('1.2M'), '1,2 M')
  assert.equal(formatLikes('11'), '11')
  assert.equal(formatLikes('0'), '')
  assert.equal(formatLikes(''), '')
})

test('formatTotal y mergeComments', () => {
  assert.equal(formatTotal(2462506), `${(2462506).toLocaleString('es-ES')} comentarios`)
  assert.equal(formatTotal(1), '1 comentario')
  assert.equal(formatTotal(null), '')
  assert.deepEqual(mergeComments([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).map((c) => c.id), ['a', 'b'])
})
