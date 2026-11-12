import assert from 'node:assert/strict'
import test from 'node:test'
import { anchorShiftRows, fluidGrid, gridColumns, gridRows, gridWindow, INITIAL_ITEMS, isNearEnd, visibleRowBand, windowFromBand } from './virtualGrid.js'

// Tarjeta de 148 + 62 de texto + 24 de separación; cuadrícula 300 px por debajo del inicio del scroll.
const base = { columns: 8, gridTop: 300, overscan: 1, rowPitch: 234, total: 1000, viewportHeight: 900 }
const heightOf = (win, columns, rowPitch) => win.padTop + win.padBottom + Math.ceil((win.end - win.start) / columns) * rowPitch

test('columnas: las que caben enteras, como repeat(auto-fill)', () => {
  assert.equal(gridColumns(148, 148, 18), 1)
  assert.equal(gridColumns(313, 148, 18), 1)
  assert.equal(gridColumns(314, 148, 18), 2)
  assert.equal(gridColumns(1400, 148, 18), 8)
  assert.equal(gridColumns(1400, 116, 18), 10)
})

test('columnas: sin medida devuelve 0 y un contenedor estrecho deja al menos una', () => {
  assert.equal(gridColumns(0, 148), 0)
  assert.equal(gridColumns(undefined, 148), 0)
  assert.equal(gridColumns(800, 0), 0)
  assert.equal(gridColumns(90, 148), 1)
})

const SIZE = { gap: 18, max: 190, min: 112 }

test('fluida: en un portátil caben 7 por fila y la tarjeta reparte el ancho', () => {
  const grid = fluidGrid({ ...SIZE, target: 7, width: 1200 })
  assert.equal(grid.columns, 7)
  assert.equal(grid.cardWidth, 156)
  // Las 7 tarjetas + 6 huecos llenan la fila sin pasarse.
  assert.ok(grid.columns * grid.cardWidth + (grid.columns - 1) * 18 <= 1200)
})

test('fluida: con el reproductor abierto (objetivo 6) siguen siendo tarjetas de tamaño razonable', () => {
  const grid = fluidGrid({ ...SIZE, target: 6, width: 880 })
  assert.equal(grid.columns, 6)
  assert.ok(grid.cardWidth >= 112 && grid.cardWidth <= 190, `ancho ${grid.cardWidth}`)
})

test('fluida: si con el objetivo la tarjeta bajaría del mínimo se quitan columnas', () => {
  const grid = fluidGrid({ ...SIZE, target: 7, width: 700 })
  assert.equal(grid.columns, 5)
  assert.ok(grid.cardWidth >= 112)
})

test('fluida: en pantallas muy anchas no se estira la tarjeta, se añaden columnas', () => {
  const grid = fluidGrid({ ...SIZE, target: 7, width: 2400 })
  assert.ok(grid.cardWidth <= 190, `ancho ${grid.cardWidth}`)
  assert.ok(grid.columns > 7)
  assert.ok(grid.columns * grid.cardWidth + (grid.columns - 1) * 18 <= 2400)
})

test('fluida: sin medida o con datos inválidos devuelve 0 columnas; un contenedor diminuto deja una', () => {
  assert.deepEqual(fluidGrid({ ...SIZE, target: 7, width: 0 }), { cardWidth: 0, columns: 0 })
  assert.deepEqual(fluidGrid({ ...SIZE, target: 0, width: 900 }), { cardWidth: 0, columns: 0 })
  assert.deepEqual(fluidGrid({ gap: 18, max: 100, min: 200, target: 7, width: 900 }), { cardWidth: 0, columns: 0 })
  const tiny = fluidGrid({ ...SIZE, target: 7, width: 80 })
  assert.equal(tiny.columns, 1)
  assert.equal(tiny.cardWidth, 80)
})

test('filas: redondea hacia arriba y tolera vacíos', () => {
  assert.equal(gridRows(0, 8), 0)
  assert.equal(gridRows(1, 8), 1)
  assert.equal(gridRows(8, 8), 1)
  assert.equal(gridRows(9, 8), 2)
  assert.equal(gridRows(9, 0), 0)
})

test('0 elementos: ventana vacía y sin relleno', () => {
  assert.deepEqual(gridWindow({ ...base, scrollTop: 0, total: 0 }), { end: 0, padBottom: 0, padTop: 0, start: 0 })
})

test('sin medidas: primer lote pequeño (no vacío) y sin relleno', () => {
  const unmeasured = windowFromBand({ band: null, columns: 0, rowPitch: 234, total: 1000 })
  assert.deepEqual(unmeasured, { end: INITIAL_ITEMS, padBottom: 0, padTop: 0, start: 0 })
  assert.equal(windowFromBand({ band: null, columns: 0, rowPitch: 234, total: 5 }).end, 5)
  assert.equal(gridWindow({ ...base, rowPitch: 0, scrollTop: 0 }).end, INITIAL_ITEMS)
})

test('columnas conocidas pero scroll sin medir: primeras filas y altura total ya reservada', () => {
  const win = gridWindow({ ...base, scrollTop: 0, viewportHeight: 0 })
  assert.equal(win.start, 0)
  assert.equal(win.end, 40) // 5 filas de 8 cubren el lote inicial de 36
  assert.equal(win.padTop, 0)
  assert.equal(heightOf(win, 8, 234), 125 * 234)
})

test('arriba del todo: empieza en 0 y monta lo visible más el margen', () => {
  const win = gridWindow({ ...base, scrollTop: 0 })
  assert.equal(win.start, 0)
  assert.equal(win.padTop, 0)
  // Visible hasta el px 600 de la cuadrícula: filas 0-2, más una de margen.
  assert.equal(win.end, 4 * 8)
})

test('a mitad: la ventana cae en filas completas y el relleno sustituye a lo no montado', () => {
  const win = gridWindow({ ...base, scrollTop: 300 + 234 * 50 })
  assert.equal(win.start, 49 * 8)
  assert.equal(win.end, 55 * 8)
  assert.equal(win.padTop, 49 * 234)
  assert.equal(win.padBottom, (125 - 55) * 234)
  assert.equal(win.start % 8, 0)
})

test('la altura total no cambia al mover la ventana', () => {
  const total = 125 * 234
  for (const scrollTop of [0, 150, 301, 5000, 12345, 29000, 99999]) {
    assert.equal(heightOf(gridWindow({ ...base, scrollTop }), 8, 234), total)
  }
})

test('lo montado depende de lo visible, no de lo cargado', () => {
  const few = gridWindow({ ...base, scrollTop: 300 + 234 * 20, total: 400 })
  const many = gridWindow({ ...base, scrollTop: 300 + 234 * 20, total: 40000 })
  assert.equal(few.end - few.start, many.end - many.start)
  assert.ok(many.end - many.start <= 80)
})

test('scroll más allá del final: quedan montadas las últimas filas, sin relleno negativo', () => {
  const win = gridWindow({ ...base, scrollTop: 10_000_000 })
  assert.equal(win.end, 1000)
  assert.equal(win.start, 124 * 8)
  assert.equal(win.padBottom, 0)
  assert.equal(win.padTop, 124 * 234)
})

test('cuadrícula por debajo de lo visible: se monta al menos la primera fila', () => {
  const win = gridWindow({ ...base, gridTop: 5000, scrollTop: 0 })
  assert.equal(win.start, 0)
  assert.equal(win.end, 8)
  assert.equal(win.padTop, 0)
})

test('última fila incompleta: end no pasa del total', () => {
  const win = gridWindow({ ...base, scrollTop: 10_000_000, total: 997 })
  assert.equal(win.end, 997)
  assert.equal(win.start, 992)
})

test('una sola columna: se comporta como una lista', () => {
  const win = gridWindow({ ...base, columns: 1, scrollTop: 300 + 234 * 10, total: 100 })
  assert.equal(win.start, 9)
  assert.equal(win.end, 15)
  assert.equal(win.padTop, 9 * 234)
  assert.equal(win.padBottom, 85 * 234)
})

test('cambio de tamaño: menos columnas, más filas y la ventana sigue alineada a filas', () => {
  const wide = gridWindow({ ...base, scrollTop: 300 + 234 * 10 })
  const narrow = gridWindow({ ...base, columns: 3, scrollTop: 300 + 234 * 10 })
  assert.equal(wide.start, 9 * 8)
  assert.equal(narrow.start, 9 * 3)
  assert.equal(narrow.start % 3, 0)
  assert.equal(heightOf(narrow, 3, 234), Math.ceil(1000 / 3) * 234)
})

test('margen: cada fila de overscan añade una fila por cada lado', () => {
  const none = gridWindow({ ...base, overscan: 0, scrollTop: 300 + 234 * 50 })
  const two = gridWindow({ ...base, overscan: 2, scrollTop: 300 + 234 * 50 })
  assert.equal(none.start, 50 * 8)
  assert.equal(two.start, 48 * 8)
  assert.equal(two.end - none.end, 2 * 8)
})

test('franja visible: no cambia con desplazamientos dentro de la misma fila', () => {
  const a = visibleRowBand({ gridTop: 0, rowPitch: 234, scrollTop: 2340, viewportHeight: 936 })
  const b = visibleRowBand({ gridTop: 0, rowPitch: 234, scrollTop: 2340 + 40, viewportHeight: 936 })
  assert.deepEqual(a, { first: 9, last: 15 })
  assert.deepEqual(a, b)
  assert.equal(visibleRowBand({ rowPitch: 234, scrollTop: 0, viewportHeight: 0 }), null)
  assert.equal(visibleRowBand({ rowPitch: 0, scrollTop: 0, viewportHeight: 900 }), null)
})

test('cerca del final: avisa a pocas filas de lo cargado y siempre con listas cortas', () => {
  assert.equal(isNearEnd({ columns: 8, end: 400, total: 1000 }), false)
  assert.equal(isNearEnd({ columns: 8, end: 976, total: 1000 }), true)
  assert.equal(isNearEnd({ columns: 8, end: 975, total: 1000 }), false)
  assert.equal(isNearEnd({ columns: 0, end: 36, total: 1000 }), false)
  assert.equal(isNearEnd({ columns: 0, end: 5, total: 5 }), true)
  assert.equal(isNearEnd({ columns: 8, end: 0, total: 0 }), true)
})

test('columnas: un ancho con decimales por debajo del múltiplo no cuenta una columna de más', () => {
  assert.equal(gridColumns(812, 148, 18), 5)
  assert.equal(gridColumns(811.6, 148, 18), 4)
})

test('ancla: filas que baja una tarjeta cuando se insertan otras por delante', () => {
  // 25 playlists nuevas por delante de la tarjeta 400, con 8 columnas: de la fila 50 a la 53.
  assert.equal(anchorShiftRows({ columns: 8, from: 400, to: 425 }), 3)
  assert.equal(anchorShiftRows({ columns: 8, from: 400, to: 403 }), 0)
  assert.equal(anchorShiftRows({ columns: 8, from: 400, to: 380 }), -3)
  // Sin columnas, o si la tarjeta ya no está, no se compensa nada.
  assert.equal(anchorShiftRows({ columns: 0, from: 400, to: 425 }), 0)
  assert.equal(anchorShiftRows({ columns: 8, from: 400, to: -1 }), 0)
})
