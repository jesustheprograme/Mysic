import assert from 'node:assert/strict'
import test from 'node:test'
import { pickAccent } from './dominantColor.js'

function solid(r, g, b, count = 50, alpha = 255) {
  return Array.from({ length: count }, () => [r, g, b, alpha]).flat()
}

test('pickAccent devuelve un hex con el tono dominante', () => {
  const accent = pickAccent(Uint8ClampedArray.from([...solid(220, 30, 40), ...solid(30, 60, 200, 5)]))
  assert.match(accent, /^#[0-9a-f]{6}$/)
  const [r, , b] = [1, 3, 5].map((start) => parseInt(accent.slice(start, start + 2), 16))
  assert.ok(r > b, `esperaba dominante rojo, obtuve ${accent}`)
})

test('pickAccent ignora grises, casi negros, blancos y transparentes', () => {
  const dull = [
    ...solid(128, 128, 128),
    ...solid(5, 5, 5),
    ...solid(250, 250, 250),
    ...solid(255, 0, 0, 50, 0),
  ]
  assert.equal(pickAccent(Uint8ClampedArray.from(dull)), null)
})

test('pickAccent tolera entradas vacías', () => {
  assert.equal(pickAccent(null), null)
  assert.equal(pickAccent(new Uint8ClampedArray(0)), null)
})
