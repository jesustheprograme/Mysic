import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CARD_META_PX, fluidGrid, GRID_COLUMN_GAP, GRID_ROW_GAP, visibleRowBand, windowFromBand } from './virtualGrid.js'

// Última cuadrícula medida, por tipo de tarjeta. Al volver de un álbum o artista el primer render ya reserva
// la altura completa y el scroll guardado se puede restaurar antes de medir de nuevo.
const lastGrid = new Map()

/**
 * Antepasados que recortan su contenido en vertical (con scroll u ocultando lo que sobra). No hace falta
 * saber cuál de ellos es el que se desplaza: uno que crece con su contenido no recorta nada y no estorba.
 */
function clippingAncestors(element) {
  const found = []
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') found.push(node)
  }
  return found
}

/** ¿Está abierto (no contraído) el reproductor lateral? Reduce el ancho útil y se pide una columna menos. */
function sidePlayerOpen(node) {
  const app = node.closest('.music-app')
  return Boolean(app?.classList.contains('music-app--player-open') && !app.classList.contains('music-app--player-collapsed'))
}

const sameView = (a, b) => a.columns === b.columns && a.cardWidth === b.cardWidth && a.band?.first === b.band?.first && a.band?.last === b.band?.last

/**
 * Ventana de una cuadrícula de tarjetas (ver virtualGrid.js) con ancho de tarjeta ligeramente fluido.
 *
 * Las columnas salen del ancho del contenedor: `columns` (o `playerColumns` con el reproductor lateral abierto),
 * acotando la tarjeta entre `minWidth` y `maxWidth`. El alto de fila sale de ese ancho (`aspect` por el ancho más
 * `metaPx` de texto), así que la altura total se conoce sin montar las tarjetas.
 *
 * `ref` va en el contenedor de la cuadrícula (con tabIndex -1: recibe el foco de una tarjeta desmontada); el
 * relleno (`padTop` / `padBottom`) se aplica como padding de ese mismo contenedor. La franja visible sale de lo que
 * dejan ver los antepasados que recortan. Se mide como mucho una vez por fotograma y el estado solo cambia cuando
 * cambia la franja de filas, las columnas o el ancho de tarjeta, no en cada evento de scroll.
 */
export default function useVirtualGrid({ aspect = 1, columnGap = GRID_COLUMN_GAP, columns: targetColumns, maxWidth, metaPx = CARD_META_PX, minWidth, playerColumns = targetColumns - 1, rowGap = GRID_ROW_GAP, total }) {
  const ref = useRef(null)
  const shiftRef = useRef(null)
  const shiftScroll = useCallback((pixels) => shiftRef.current?.(pixels), [])
  const cacheKey = `${aspect}:${metaPx}`
  const rowHeightOf = useCallback((cardWidth) => Math.round(cardWidth * aspect) + metaPx, [aspect, metaPx])
  const [view, setView] = useState(() => ({ band: null, cardWidth: 0, columns: 0, ...lastGrid.get(cacheKey) }))

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const clippers = clippingAncestors(node)
    let current = null
    let frame = 0

    const measure = () => {
      // Área visible en coordenadas de ventana: la pantalla recortada por cada antepasado que recorta.
      let top = 0
      let bottom = window.innerHeight
      for (const clipper of clippers) {
        const rect = clipper.getBoundingClientRect()
        top = Math.max(top, rect.top)
        bottom = Math.min(bottom, rect.bottom)
      }
      // Ancho con decimales (clientWidth redondea). Oculta (ancho 0) conserva la última cuadrícula: la altura
      // reservada no se pierde y el scroll guardado sigue siendo válido al volver a mostrarse.
      const box = node.getBoundingClientRect()
      const fluid = fluidGrid({ gap: columnGap, max: maxWidth, min: minWidth, target: sidePlayerOpen(node) ? playerColumns : targetColumns, width: box.width })
      const { cardWidth, columns } = fluid.columns ? fluid : (lastGrid.get(cacheKey) ?? fluid)
      if (fluid.columns) lastGrid.set(cacheKey, { cardWidth, columns })
      return {
        band: visibleRowBand({ rowPitch: rowHeightOf(cardWidth) + rowGap, scrollTop: top - box.top, viewportHeight: bottom - top }),
        cardWidth,
        columns,
      }
    }
    const apply = (sync) => {
      const next = measure()
      if (current && sameView(current, next)) return
      current = next
      if (!sync) {
        setView(next)
        return
      }
      const hadFocus = node.contains(document.activeElement)
      // Dentro del fotograma se confirma en el acto: las filas nuevas llegan al mismo pintado que el scroll.
      flushSync(() => setView(next))
      // La tarjeta enfocada salió de la ventana: el foco pasa a la cuadrícula en vez de caer a <body>,
      // y el siguiente Tab sigue por las tarjetas visibles.
      if (hadFocus && !node.contains(document.activeElement)) node.focus({ preventScroll: true })
    }
    // Desplaza el contenedor con scroll (lo insertado por encima de lo visible) y vuelve a medir antes de pintar.
    shiftRef.current = (pixels) => {
      const scroller = clippers.find((clipper) => clipper.scrollHeight > clipper.clientHeight && /auto|scroll/.test(getComputedStyle(clipper).overflowY))
        ?? document.scrollingElement
      if (!scroller) return
      scroller.scrollTop += pixels
      apply(false)
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        apply(true)
      })
    }

    apply(false)
    // En captura: llega el scroll de cualquier antepasado (el evento de scroll no burbujea).
    const listening = { capture: true, passive: true }
    window.addEventListener('scroll', schedule, listening)
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(node)
    for (const clipper of clippers) observer?.observe(clipper)
    // Abrir o contraer el reproductor lateral cambia la clase de la app (y casi siempre el ancho).
    const app = node.closest('.music-app')
    const classes = typeof MutationObserver === 'undefined' || !app ? null : new MutationObserver(schedule)
    classes?.observe(app, { attributeFilter: ['class'], attributes: true })

    return () => {
      shiftRef.current = null
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, listening)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
      classes?.disconnect()
    }
  }, [cacheKey, columnGap, maxWidth, minWidth, playerColumns, rowGap, rowHeightOf, targetColumns])

  // La ventana se deriva en el render: si llegan más elementos (otra página) se ajusta sin volver a medir.
  const rowHeight = view.cardWidth ? rowHeightOf(view.cardWidth) : rowHeightOf(minWidth)
  const rowPitch = view.cardWidth ? rowHeight + rowGap : 0
  const range = useMemo(
    () => windowFromBand({ band: view.band, columns: view.columns, rowPitch, total }),
    [rowPitch, total, view],
  )
  return { ...range, cardWidth: view.cardWidth || minWidth, columns: view.columns, ref, rowHeight, shiftScroll }
}
