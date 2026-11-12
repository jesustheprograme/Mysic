// Cálculo puro de la ventana de una cuadrícula de tarjetas (sin React ni DOM).
// Misma idea que el ventaneo de filas de limusic, llevada a una rejilla: solo se montan las filas de
// tarjetas visibles más un margen; el resto se sustituye por relleno arriba y abajo para que la barra
// de scroll conserve la longitud de la cuadrícula completa.

/** Separación horizontal y vertical de la cuadrícula de la biblioteca (px). */
export const GRID_COLUMN_GAP = 18
export const GRID_ROW_GAP = 24
/** Alto del texto bajo la portada: margen + título + artista + detalle (px). */
export const CARD_META_PX = 62
/** Filas de margen a cada lado de lo visible. */
export const OVERSCAN_ROWS = 1
/** Tarjetas del primer pintado, antes de medir nada (y en el render de servidor). */
export const INITIAL_ITEMS = 36
/** A cuántas filas del final de lo cargado se pide la página siguiente. */
export const NEAR_END_ROWS = 3

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/** Columnas de `repeat(auto-fill, cardWidth)` en un contenedor de `width` px. 0 si aún no hay medida. */
export function gridColumns(width, cardWidth, gap = GRID_COLUMN_GAP) {
  if (!(width > 0) || !(cardWidth > 0)) return 0
  return Math.max(1, Math.floor((width + gap) / (cardWidth + gap)))
}

/**
 * Cuadrícula "un poco fluida": busca `target` columnas y reparte el ancho entre ellas, pero la tarjeta nunca baja de
 * `min` ni sube de `max`. Si no cabe con `min` se quitan columnas; si sobra ancho con `max` se añaden columnas
 * (así una pantalla muy ancha muestra más tarjetas, no tarjetas deformadas). 0 columnas si aún no hay medida.
 */
export function fluidGrid({ gap = GRID_COLUMN_GAP, max, min, target, width }) {
  if (!(width > 0) || !(target > 0) || !(min > 0) || !(max >= min)) return { cardWidth: 0, columns: 0 }
  const fit = (columns) => Math.floor((width - (columns - 1) * gap) / columns)
  let columns = Math.max(1, Math.floor(target))
  if (fit(columns) < min) columns = Math.max(1, Math.floor((width + gap) / (min + gap)))
  else if (fit(columns) > max) columns = Math.max(columns, Math.ceil((width + gap) / (max + gap)))
  return { cardWidth: Math.max(1, Math.min(max, fit(columns))), columns }
}

export function gridRows(total, columns) {
  return total > 0 && columns > 0 ? Math.ceil(total / columns) : 0
}

/**
 * Franja de filas [first, last] que toca el área visible, con el margen incluido y SIN acotar a la
 * cuadrícula (puede ser negativa o pasarse del final). null mientras falte alguna medida.
 * - gridTop: posición del inicio de la cuadrícula dentro del contenido del contenedor con scroll.
 * - rowPitch: distancia entre el inicio de dos filas consecutivas (alto de fila + separación).
 */
export function visibleRowBand({ gridTop = 0, overscan = OVERSCAN_ROWS, rowPitch, scrollTop = 0, viewportHeight }) {
  if (!(rowPitch > 0) || !(viewportHeight > 0)) return null
  const offset = scrollTop - gridTop
  return {
    first: Math.floor(offset / rowPitch) - overscan,
    last: Math.floor((offset + viewportHeight) / rowPitch) + overscan,
  }
}

/**
 * Tarjetas [start, end) a montar y relleno que sustituye al resto.
 * Sin columnas o sin altura de fila devuelve el primer lote sin relleno; con ellas pero sin franja
 * (aún no se midió el scroll) devuelve las primeras filas y reserva ya la altura total.
 * La altura completa es siempre filas * rowPitch - separación, se mueva como se mueva la ventana.
 */
export function windowFromBand({ band, columns, initialItems = INITIAL_ITEMS, rowPitch, total }) {
  if (!(total > 0)) return { end: 0, padBottom: 0, padTop: 0, start: 0 }
  if (!(columns > 0) || !(rowPitch > 0)) return { end: Math.min(total, initialItems), padBottom: 0, padTop: 0, start: 0 }

  const rows = gridRows(total, columns)
  const first = band ? band.first : 0
  const last = band ? band.last : Math.ceil(initialItems / columns) - 1
  // Siempre queda al menos una fila montada, también con el scroll más allá del final o antes del inicio.
  const startRow = clamp(first, 0, rows - 1)
  const endRow = clamp(last + 1, startRow + 1, rows)
  return {
    end: Math.min(total, endRow * columns),
    padBottom: (rows - endRow) * rowPitch,
    padTop: startRow * rowPitch,
    start: startRow * columns,
  }
}

/** Atajo: de las medidas del scroll a la ventana. */
export function gridWindow({ columns, gridTop, initialItems, overscan, rowPitch, scrollTop, total, viewportHeight }) {
  const band = columns > 0 ? visibleRowBand({ gridTop, overscan, rowPitch, scrollTop, viewportHeight }) : null
  return windowFromBand({ band, columns, initialItems, rowPitch, total })
}

/**
 * Filas que se ha movido una tarjeta al cambiar la lista (de la posición `from` a la `to`). Sirve para
 * compensar el scroll cuando una página nueva entra por encima de lo que se está viendo. 0 si no se sabe.
 */
export function anchorShiftRows({ columns, from, to }) {
  if (!(columns > 0) || !(from >= 0) || !(to >= 0)) return 0
  return Math.floor(to / columns) - Math.floor(from / columns)
}

/** ¿La ventana llega a las últimas filas de lo cargado? (momento de pedir más al servidor) */
export function isNearEnd({ columns, end, rows = NEAR_END_ROWS, total }) {
  return total - end <= Math.max(1, columns) * rows
}
