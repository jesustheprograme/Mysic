import assert from 'node:assert/strict'
import test from 'node:test'
import { rememberBlockedId, shouldFallbackToStream } from './streamFallback.js'

test('solo los errores de incrustación pasan al audio por el servidor', () => {
  for (const code of [101, 150, 5, '101']) assert.equal(shouldFallbackToStream(code), true)
  for (const code of [2, 100, 0, undefined, null]) assert.equal(shouldFallbackToStream(code), false)
})

test('rememberBlockedId añade sin duplicar, ignora vacíos y recorta a 300', () => {
  const first = rememberBlockedId([], 'a')
  assert.deepEqual(first, ['a'])
  assert.equal(rememberBlockedId(first, 'a'), first)
  assert.equal(rememberBlockedId(first, ''), first)

  let ids = []
  for (let i = 0; i < 350; i += 1) ids = rememberBlockedId(ids, `v${i}`)
  assert.equal(ids.length, 300)
  assert.equal(ids[0], 'v50')
  assert.equal(ids.at(-1), 'v349')
})
