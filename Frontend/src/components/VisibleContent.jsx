import { useEffect, useRef, useState } from 'react'

// Keep the section's space, but mount its content only near the viewport.
// The viewport observer also respects clipping by Mysic's internal scroll area.
export default function VisibleContent({ children, onVisible, title, minHeight = 300 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!globalThis.IntersectionObserver) {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '160px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !onVisible) return undefined
    let cancelled = false
    Promise.resolve(onVisible()).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [visible, onVisible])

  return (
    <div ref={ref} style={{ minWidth: 0, minHeight: visible ? undefined : minHeight }}>
      {visible ? children : <h2>{title}</h2>}
      {error && <button type="button" onClick={() => {
        setError(false)
        Promise.resolve(onVisible()).catch(() => setError(true))
      }}>Reintentar cargar {title}</button>}
    </div>
  )
}
