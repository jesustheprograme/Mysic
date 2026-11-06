import { useEffect, useRef, useState } from 'react'

/**
 * Flecha flotante "ir a la canción activa".
 *
 * En listas normales calcula la posición con el nodo de la fila activa. En listas largas con ventana
 * de renderizado (ver useWindowedRows) la fila activa puede no estar montada, así que `metricsRef`
 * aporta el índice activo y la altura de fila y la posición se calcula con ellos.
 */
export default function useActiveTrackArrow({ selectedSongAlbumId, selectedSongBelongsToCollection, selectedSongId, songs }) {
  const tracksRef = useRef(null)
  const activeTrackRef = useRef(null)
  const arrowRef = useRef(null)
  const metricsRef = useRef(null)
  const naturalTopRef = useRef(0)
  const suppressArrowRef = useRef(false)
  const [direction, setDirection] = useState(null)

  useEffect(() => {
    suppressArrowRef.current = false
  }, [selectedSongAlbumId, selectedSongId])

  useEffect(() => {
    const tracks = tracksRef.current
    const hasWindowedRow = () => (metricsRef.current?.activeIndex ?? -1) >= 0
    if (!tracks || !selectedSongBelongsToCollection || (!activeTrackRef.current && !hasWindowedRow())) {
      setDirection(null)
      return undefined
    }

    let frameId = 0
    const updatePosition = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const tracksBounds = tracks.getBoundingClientRect()
        const metrics = metricsRef.current
        let viewportTop
        let rowHeight

        if (metrics && metrics.activeIndex >= 0) {
          // Modo ventana: la lista incluye el relleno de las filas no montadas, así que la posición de
          // cualquier fila es el inicio de la lista más índice × altura de fila.
          rowHeight = metrics.pitch
          viewportTop = metrics.list().getBoundingClientRect().top + metrics.activeIndex * metrics.pitch
        } else {
          const activeTrack = activeTrackRef.current
          if (!activeTrack) {
            setDirection(null)
            return
          }
          let naturalTop = activeTrack.offsetTop
          let ancestor = activeTrack.offsetParent
          while (ancestor && ancestor !== tracks) {
            naturalTop += ancestor.offsetTop
            ancestor = ancestor.offsetParent
          }
          naturalTopRef.current = naturalTop
          rowHeight = activeTrack.offsetHeight
          viewportTop = tracksBounds.top + naturalTop - tracks.scrollTop
        }

        const viewportBottom = viewportTop + rowHeight
        let nextDirection = null
        if (!suppressArrowRef.current && viewportBottom < tracksBounds.top) nextDirection = 'up'
        if (!suppressArrowRef.current && viewportTop > tracksBounds.bottom) nextDirection = 'down'
        const arrowTop = nextDirection === 'up'
          ? tracksBounds.top + (rowHeight / 2)
          : tracksBounds.bottom - (rowHeight / 2)

        if (arrowRef.current) {
          arrowRef.current.style.left = `${tracksBounds.left - 42}px`
          arrowRef.current.style.top = `${arrowTop}px`
        }
        setDirection((current) => current === nextDirection ? current : nextDirection)
      })
    }

    const restoreArrow = () => {
      if (!suppressArrowRef.current) return
      suppressArrowRef.current = false
      updatePosition()
    }
    const restoreArrowFromKeyboard = (event) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) restoreArrow()
    }

    // En modo ventana el scroll puede ocurrir en un ancestro de `tracks`, no en `tracks` mismo.
    const scrollTarget = metricsRef.current ? metricsRef.current.scroller() : tracks
    const scrollTargetEvents = scrollTarget === document.scrollingElement ? window : scrollTarget

    updatePosition()
    tracks.addEventListener('scroll', updatePosition, { passive: true })
    scrollTargetEvents.addEventListener('scroll', updatePosition, { passive: true })
    tracks.addEventListener('wheel', restoreArrow, { passive: true })
    tracks.addEventListener('touchstart', restoreArrow, { passive: true })
    tracks.addEventListener('pointerdown', restoreArrow)
    const resizeObserver = new ResizeObserver(updatePosition)
    resizeObserver.observe(tracks)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('keydown', restoreArrowFromKeyboard)

    return () => {
      cancelAnimationFrame(frameId)
      tracks.removeEventListener('scroll', updatePosition)
      scrollTargetEvents.removeEventListener('scroll', updatePosition)
      tracks.removeEventListener('wheel', restoreArrow)
      tracks.removeEventListener('touchstart', restoreArrow)
      tracks.removeEventListener('pointerdown', restoreArrow)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('keydown', restoreArrowFromKeyboard)
    }
  }, [selectedSongAlbumId, selectedSongBelongsToCollection, selectedSongId, songs])

  function scrollToActiveTrack() {
    const tracks = tracksRef.current
    if (!tracks) return
    const metrics = metricsRef.current

    if (metrics && metrics.activeIndex >= 0) {
      const scroller = metrics.scroller()
      const rowViewportTop = metrics.list().getBoundingClientRect().top + metrics.activeIndex * metrics.pitch
      const scrollerTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
      const viewportHeight = scroller === document.scrollingElement ? window.innerHeight : scroller.clientHeight
      suppressArrowRef.current = true
      setDirection(null)
      scroller.scrollTo({
        behavior: 'smooth',
        top: scroller.scrollTop + rowViewportTop - (scrollerTop + (viewportHeight - metrics.pitch) / 2),
      })
      return
    }

    const activeTrack = activeTrackRef.current
    if (!activeTrack) return
    suppressArrowRef.current = true
    setDirection(null)
    tracks.scrollTo({
      behavior: 'smooth',
      top: naturalTopRef.current - ((tracks.clientHeight - activeTrack.offsetHeight) / 2),
    })
  }

  return { activeTrackRef, arrowRef, direction, metricsRef, scrollToActiveTrack, tracksRef }
}
