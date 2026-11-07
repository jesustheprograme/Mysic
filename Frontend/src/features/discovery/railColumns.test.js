import assert from 'node:assert/strict'
import test from 'node:test'
import { columnsFor } from './railColumns.js'

test('caben N tarjetas enteras con su separación', () => {
  // 7 tarjetas de 136 + 6 huecos de 18 = 1060
  assert.equal(columnsFor(1060, 136, 18), 7)
  assert.equal(columnsFor(1059, 136, 18), 6, 'un píxel menos y ya no cabe la séptima')
  assert.equal(columnsFor(1462, 136, 18), 9)
})

test('nunca baja de dos columnas y tolera medidas inválidas', () => {
  assert.equal(columnsFor(100, 136, 18), 2)
  assert.equal(columnsFor(0), 0)
  assert.equal(columnsFor(NaN), 0)
  assert.equal(columnsFor(800, 0), 0)
})

test('las tarjetas resultantes nunca son menores que el mínimo pedido', () => {
  for (let width = 300; width <= 2000; width += 37) {
    const columns = columnsFor(width, 136, 18)
    const card = (width - (columns - 1) * 18) / columns
    if (columns > 2) assert.ok(card >= 136 - 0.001, `${width}px -> ${card}`)
  }
})
