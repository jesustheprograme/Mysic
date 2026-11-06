import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computeWindow, FALLBACK_PITCH, windowPadding } from './windowMath.js'

const INITIAL_ROWS = 40

/** Contenedor con scroll más cercano (la lista no hace scroll por sí misma en todas las pantallas). */
export function findScrollParent(element) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
  }
  return document.scrollingElement
}

/**
 * Monta solo las filas visibles de una lista larga (ver windowMath.js).
 *
 * - `enabled: false` devuelve el rango completo y no escucha nada.
 * - `frozen: true` congela el rango (se usa mientras se arrastra una fila: si se desmontara la fila
 *   arrastrada al hacer scroll, el arrastre se perdería).
 * - El relleno se aplica como padding de la propia lista (`paddingTop`/`paddingBottom`).
 * - La altura de fila se mide de las filas montadas en vez de suponerse.
 */
export default function useWindowedRows({ count, enabled, frozen = false, listRef }) {
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(count, INITIAL_ROWS) }))
  const [pitch, setPitch] = useState(FALLBACK_PITCH)
  const frozenRef = useRef(frozen)
  const pitchRef = useRef(FALLBACK_PITCH)

  useEffect(() => {
    frozenRef.current = frozen
  })

  const update = useCallback(() => {
    const list = listRef.current
    if (!list || frozenRef.current) return

    const scroller = findScrollParent(list)
    const isDocument = scroller === document.scrollingElement
    const scrollerTop = isDocument ? 0 : scroller.getBoundingClientRect().top
    const listTop = list.getBoundingClientRect().top - scrollerTop + scroller.scrollTop
    const viewportHeight = isDocument ? window.innerHeight : scroller.clientHeight

    let measured = pitchRef.current
    const [first, second] = [list.children[0], list.children[1]]
    if (first && second) {
      const distance = second.offsetTop - first.offsetTop
      if (distance > 0) measured = distance
    }
    pitchRef.current = measured
    setPitch((current) => (Math.abs(current - measured) > 0.5 ? measured : current))

    const next = computeWindow({ scrollTop: scroller.scrollTop, viewportHeight, listTop, pitch: measured, count })
    setRange((current) => (current.start === next.start && current.end === next.end ? current : next))
  }, [count, listRef])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const list = listRef.current
    if (!list) return undefined

    update()
    const scroller = findScrollParent(list)
    const target = scroller === document.scrollingElement ? window : scroller
    let frameId = 0
    const schedule = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(update)
    }

    target.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(list)
    if (scroller !== document.scrollingElement) resizeObserver.observe(scroller)

    return () => {
      cancelAnimationFrame(frameId)
      target.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resizeObserver.disconnect()
    }
  }, [enabled, listRef, update])

  if (!enabled) {
    return { end: count, isWindowed: false, paddingBottom: 0, paddingTop: 0, pitch, start: 0 }
  }

  // El rango guardado puede quedar fuera de la lista justo tras filtrar o recortar canciones.
  const end = Math.min(range.end, count)
  const start = Math.min(range.start, end)
  const padding = windowPadding({ start, end, count, pitch })
  return { end, isWindowed: true, paddingBottom: padding.bottom, paddingTop: padding.top, pitch, start }
}
