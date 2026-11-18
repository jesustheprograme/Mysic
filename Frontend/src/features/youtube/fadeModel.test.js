import assert from 'node:assert/strict'
import test from 'node:test'
import { FADE_MS, fadeGain, pauseFadeGain } from './fadeModel.js'

test('pauseFadeGain: de 1 a 0 en 1 s con caída suave al final', () => {
  assert.equal(FADE_MS, 1000)
  assert.equal(pauseFadeGain(0), 1)
  assert.equal(pauseFadeGain(500), 0.25)
  assert.equal(pauseFadeGain(1000), 0)
  assert.equal(pauseFadeGain(5000), 0)
  assert.equal(pauseFadeGain(-10), 1)
  assert.equal(pauseFadeGain(100, 0), 0)
})

test('fadeGain: sube en el primer segundo y baja en el último', () => {
  assert.equal(fadeGain(0, 200), 0)
  assert.equal(fadeGain(0.5, 200), 0.5)
  assert.equal(fadeGain(1, 200), 1)
  assert.equal(fadeGain(100, 200), 1)
  assert.equal(fadeGain(199.5, 200), 0.5)
  assert.equal(fadeGain(200, 200), 0)
  assert.equal(fadeGain(201, 200), 0)
})

test('fadeGain: sin duración conocida solo hay fundido de entrada', () => {
  assert.equal(fadeGain(0.25, Infinity), 0.25)
  assert.equal(fadeGain(50, 0), 1)
  assert.equal(fadeGain(50, NaN), 1)
})

test('fadeGain: canción muy corta y valores raros', () => {
  // 1,5 s: a 0,75 s las dos rampas valen 0,75.
  assert.equal(fadeGain(0.75, 1.5), 0.75)
  assert.equal(fadeGain(NaN, 200), 1)
  assert.equal(fadeGain(-1, 200), 1)
  assert.equal(fadeGain(0.5, 200, 0), 1)
})
