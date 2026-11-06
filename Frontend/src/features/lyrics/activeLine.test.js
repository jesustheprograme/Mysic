import assert from 'node:assert/strict'
import test from 'node:test'
import { findActiveLineIndex, lyricsDuration } from './activeLine.js'

const lines = [
  { time: 5, text: 'a' },
  { time: 10, text: 'b' },
  { time: 20, text: 'c' },
]

test('findActiveLineIndex devuelve la última línea ya alcanzada', () => {
  assert.equal(findActiveLineIndex(lines, 0), -1)
  assert.equal(findActiveLineIndex(lines, 5), 0)
  assert.equal(findActiveLineIndex(lines, 9.99), 0)
  assert.equal(findActiveLineIndex(lines, 10), 1)
  assert.equal(findActiveLineIndex(lines, 999), 2)
})

test('findActiveLineIndex tolera entradas vacías o inválidas', () => {
  assert.equal(findActiveLineIndex([], 5), -1)
  assert.equal(findActiveLineIndex(null, 5), -1)
  assert.equal(findActiveLineIndex(lines, Number.NaN), -1)
})

test('lyricsDuration prefiere la duración del catálogo', () => {
  assert.equal(lyricsDuration(200.4, 190), 200)
  assert.equal(lyricsDuration(0, 190.6), 191)
  assert.equal(lyricsDuration(undefined, undefined), 0)
})
