import assert from 'node:assert/strict'
import test from 'node:test'
import { computeWindow, rowTop, shouldWindow, windowPadding } from './windowMath.js'

const base = { viewportHeight: 740, listTop: 300, pitch: 74, count: 5000, overscan: 10 }

test('shouldWindow solo activa listas largas y sin encabezados de disco', () => {
  assert.equal(shouldWindow({ count: 99, hasDiscHeadings: false }), false)
  assert.equal(shouldWindow({ count: 100, hasDiscHeadings: false }), true)
  assert.equal(shouldWindow({ count: 5000, hasDiscHeadings: true }), false)
})

test('al inicio de la lista monta desde 0 con margen por abajo', () => {
  const { start, end } = computeWindow({ ...base, scrollTop: 0 })
  assert.equal(start, 0)
  // visibles = ceil(740/74)+1 = 11; first negativo (-5): end = -5 + 11 + 10 = 16
  assert.equal(end, 16)
})

test('en mitad de la lista monta solo viewport + margen', () => {
  const { start, end } = computeWindow({ ...base, scrollTop: 300 + 74 * 1000 })
  assert.equal(start, 990)
  assert.equal(end, 1021)
  assert.ok(end - start < 40)
})

test('al final no pasa de count y al principio no baja de 0', () => {
  const bottom = computeWindow({ ...base, scrollTop: 300 + 74 * 6000 })
  assert.equal(bottom.end, 5000)
  assert.ok(bottom.start <= 5000)
  const top = computeWindow({ ...base, scrollTop: 0 })
  assert.equal(top.start, 0)
})

test('con medidas inválidas o sin filas no revienta', () => {
  assert.deepEqual(computeWindow({ ...base, count: 0, scrollTop: 0 }), { start: 0, end: 0 })
  assert.deepEqual(computeWindow({ ...base, pitch: 0, scrollTop: 0 }), { start: 0, end: 40 })
  assert.deepEqual(computeWindow({ ...base, viewportHeight: 0, count: 20, scrollTop: 0 }), { start: 0, end: 20 })
})

test('el relleno conserva la altura total de la lista completa', () => {
  const { start, end } = computeWindow({ ...base, scrollTop: 300 + 74 * 1000 })
  const padding = windowPadding({ start, end, count: base.count, pitch: base.pitch })
  assert.equal(padding.top + (end - start) * base.pitch + padding.bottom, base.count * base.pitch)
})

test('rowTop coincide con el relleno superior en la primera fila montada', () => {
  const { start } = computeWindow({ ...base, scrollTop: 300 + 74 * 1000 })
  const padding = windowPadding({ start, end: start + 30, count: base.count, pitch: base.pitch })
  assert.equal(rowTop({ index: start, listTop: base.listTop, pitch: base.pitch }), base.listTop + padding.top)
})
