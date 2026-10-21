import { useEffect, useRef, useState } from 'react'

export default function useActiveTrackArrow({ selectedSongAlbumId, selectedSongBelongsToCollection, selectedSongId, songs }) {
  const tracksRef = useRef(null)
  const activeTrackRef = useRef(null)
  const arrowRef = useRef(null)
  const naturalTopRef = useRef(0)
  const suppressArrowRef = useRef(false)
  const [direction, setDirection] = useState(null)

  useEffect(() => {
    suppressArrowRef.current = false
  }, [selectedSongAlbumId, selectedSongId])

  useEffect(() => {
    const tracks = tracksRef.current
    const activeTrack = activeTrackRef.current
    if (!tracks || !activeTrack || !selectedSongBelongsToCollection) {
      setDirection(null)
      return undefined
    }

    let frameId = 0
    const updatePosition = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const tracksBounds = tracks.getBoundingClientRect()
        let naturalTop = activeTrack.offsetTop
        let ancestor = activeTrack.offsetParent
        while (ancestor && ancestor !== tracks) {
          naturalTop += ancestor.offsetTop
          ancestor = ancestor.offsetParent
        }
        naturalTopRef.current = naturalTop

        const viewportTop = tracksBounds.top + naturalTop - tracks.scrollTop
        const viewportBottom = viewportTop + activeTrack.offsetHeight
        let nextDirection = null
        if (!suppressArrowRef.current && viewportBottom < tracksBounds.top) nextDirection = 'up'
        if (!suppressArrowRef.current && viewportTop > tracksBounds.bottom) nextDirection = 'down'
        const arrowTop = nextDirection === 'up'
          ? tracksBounds.top + (activeTrack.offsetHeight / 2)
          : tracksBounds.bottom - (activeTrack.offsetHeight / 2)

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

    updatePosition()
    tracks.addEventListener('scroll', updatePosition, { passive: true })
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
    const activeTrack = activeTrackRef.current
    if (!tracks || !activeTrack) return
    suppressArrowRef.current = true
    setDirection(null)
    tracks.scrollTo({
      behavior: 'smooth',
      top: naturalTopRef.current - ((tracks.clientHeight - activeTrack.offsetHeight) / 2),
    })
  }

  return { activeTrackRef, arrowRef, direction, scrollToActiveTrack, tracksRef }
}
