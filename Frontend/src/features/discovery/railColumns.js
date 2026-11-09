import { useLayoutEffect, useState } from 'react'

export const RAIL_GAP = 18
/** Filas que "Ver todo" suma a la fila visible del carrusel. */
export const EXPANDED_EXTRA_ROWS = 3
export const DEFAULT_CARD_MIN = 148

/**
 * Cuántas tarjetas caben ENTERAS en un carrusel de `width` px con tarjetas de al menos `min` px y
 * `gap` entre ellas. Con este número las tarjetas se reparten el ancho exacto y no queda un trozo
 * de la siguiente asomando por el borde.
 */
export function columnsFor(width, min = DEFAULT_CARD_MIN, gap = RAIL_GAP) {
  if (!(width > 0) || !(min > 0)) return 0
  return Math.max(2, Math.floor((width + gap) / (min + gap)))
}

/**
 * Número de columnas del carrusel `ref`, recalculado al cambiar su ancho. 0 hasta la primera medida.
 * Las medidas se agrupan en un fotograma (varios cambios de tamaño seguidos miden una sola vez) y el
 * estado solo cambia cuando el número de columnas cambia de verdad.
 */
export default function useRailColumns(ref) {
  const [columns, setColumns] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    let frame = 0
    const measure = () => {
      frame = 0
      const min = parseFloat(getComputedStyle(node).getPropertyValue('--shelf-card-min')) || DEFAULT_CARD_MIN
      setColumns(columnsFor(node.clientWidth, min))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref])

  return columns
}
