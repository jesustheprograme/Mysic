import assert from 'node:assert/strict'
import test from 'node:test'
import { canImportMusic } from './musicImportAccess.js'

test('permite la importación cuando el servidor autoriza explícitamente', () => {
  assert.equal(canImportMusic({ canImportMusic: true }), true)
})

test('deniega usuarios sin permiso, con permiso falso o con valores no booleanos', () => {
  assert.equal(canImportMusic(null), false)
  assert.equal(canImportMusic({}), false)
  assert.equal(canImportMusic({ canImportMusic: false }), false)
  assert.equal(canImportMusic({ canImportMusic: 'true' }), false)
})
