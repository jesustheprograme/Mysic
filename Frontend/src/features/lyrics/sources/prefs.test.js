import assert from 'node:assert/strict'
import test from 'node:test'
import { clampOffset, readSongPrefs, subscribeSongPrefs, writeSongPrefs } from './prefs.js'

test('clampOffset: pasos de 0,25 s y ±15 s', () => {
  assert.equal(clampOffset(0.3), 0.25)
  assert.equal(clampOffset(-0.4), -0.5)
  assert.equal(clampOffset(40), 15)
  assert.equal(clampOffset('x'), 0)
})

test('almacén compartido: mismo objeto, aviso a suscriptores y vuelta a lo predeterminado', () => {
  const key = `test-${Date.now()}`
  const before = readSongPrefs(key)
  assert.equal(readSongPrefs(key), before, 'sin cambios devuelve el mismo objeto')
  let notified = 0
  const unsubscribe = subscribeSongPrefs(() => { notified += 1 })
  writeSongPrefs(key, { offset: 0.5 })
  assert.deepEqual({ ...readSongPrefs(key) }, { source: null, offset: 0.5 })
  writeSongPrefs(key, { source: 'boidu' })
  assert.deepEqual({ ...readSongPrefs(key) }, { source: 'boidu', offset: 0.5 }, 'conserva el desfase al fijar fuente')
  writeSongPrefs(key, { source: null, offset: 0 })
  assert.deepEqual({ ...readSongPrefs(key) }, { source: null, offset: 0 })
  assert.equal(notified, 3)
  unsubscribe()
  writeSongPrefs(key, { offset: 1 })
  assert.equal(notified, 3, 'sin suscripción no avisa')
})
