import assert from 'node:assert/strict'
import test from 'node:test'
import { barCount, keySeekTime, playedBars, playedFraction, resamplePeaks, timeAtPosition } from './waveformModel.js'

test('barCount: barras de 2 px con hueco de 1; al menos una si hay ancho, ninguna sin medida', () => {
  assert.equal(barCount(0), 0)
  assert.equal(barCount(undefined), 0)
  assert.equal(barCount(2), 1)
  assert.equal(barCount(240), 80) // (240 + 1) / 3
  assert.equal(barCount(299), 100)
})

test('resamplePeaks: remuestrea sin salirse del rango y tolera listas vacías', () => {
  const peaks = [0.1, 0.5, 0.9, 0.3]
  assert.deepEqual(resamplePeaks(peaks, 4), peaks)
  assert.deepEqual(resamplePeaks(peaks, 2), [0.1, 0.9])
  assert.equal(resamplePeaks(peaks, 10).length, 10)
  assert.ok(resamplePeaks(peaks, 10).every((value) => peaks.includes(value)))
  assert.deepEqual(resamplePeaks([], 5), [])
  assert.deepEqual(resamplePeaks(peaks, 0), [])
})

test('playedFraction y playedBars: acotados y 0 sin duración', () => {
  assert.equal(playedFraction(50, 200), 0.25)
  assert.equal(playedFraction(500, 200), 1)
  assert.equal(playedFraction(-3, 200), 0)
  assert.equal(playedFraction(10, 0), 0)
  assert.equal(playedFraction(NaN, 100), 0)
  assert.equal(playedBars(80, 0.25), 20)
  assert.equal(playedBars(80, 1.5), 80)
  assert.equal(playedBars(80, -1), 0)
})

test('timeAtPosition: del clic al segundo, acotado a la barra', () => {
  assert.equal(timeAtPosition(150, 300, 200), 100)
  assert.equal(timeAtPosition(-20, 300, 200), 0)
  assert.equal(timeAtPosition(999, 300, 200), 200)
  assert.equal(timeAtPosition(10, 0, 200), 0)
  assert.equal(timeAtPosition(10, 300, 0), 0)
})

test('keySeekTime: ±5 s, inicio y fin acotados; otras teclas y duración desconocida devuelven null', () => {
  assert.equal(keySeekTime('ArrowRight', 10, 100), 15)
  assert.equal(keySeekTime('ArrowLeft', 3, 100), 0)
  assert.equal(keySeekTime('ArrowRight', 98, 100), 100)
  assert.equal(keySeekTime('Home', 50, 100), 0)
  assert.equal(keySeekTime('End', 50, 100), 100)
  assert.equal(keySeekTime('a', 50, 100), null)
  assert.equal(keySeekTime('constructor', 50, 100), null)
  assert.equal(keySeekTime('Home', 50, 0), null)
})
