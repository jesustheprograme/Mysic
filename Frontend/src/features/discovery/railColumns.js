import { useLayoutEffect, useState } from 'react'

export const RAIL_GAP = 18
export const DEFAULT_CARD_MIN = 136

/**
 * Cuántas tarjetas caben ENTERAS en un carrusel de `width` px con tarjetas de al menos `min` px y
 * `gap` entre ellas. Con este número las tarjetas se reparten el ancho exacto y no queda un trozo
 * de la siguiente asomando por el borde.
 */
export function columnsFor(width, min = DEFAULT_CARD_MIN, gap = RAIL_GAP) {
  if (!(width > 0) || !(min > 0)) return 0
  return Math.max(2, Math.floor((width + gap) / (min + gap)))
}

/** Número de columnas del carrusel `ref`, recalculado al cambiar su ancho. 0 hasta la primera medida. */
export default function useRailColumns(ref) {
  const [columns, setColumns] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const measure = () => {
      const min = parseFloat(getComputedStyle(node).getPropertyValue('--shelf-card-min')) || DEFAULT_CARD_MIN
      setColumns(columnsFor(node.clientWidth, min))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return columns
}
