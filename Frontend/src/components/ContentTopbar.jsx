import { useEffect, useRef } from 'react'
import './content-topbar.css'

// Distancia de scroll (px) en la que la franja pasa de invisible a oscura del todo.
const FADE_PX = 96

/**
 * Franja superior del área de contenido (de borde a borde) donde va el buscador fijo: invisible arriba del todo y
 * cada vez más oscura al bajar.
 *
 * Rendimiento: el scroll solo cambia la `opacity` de este elemento (una vez por fotograma, con rAF): no toca variables
 * heredadas ni provoca recálculos de estilo en el resto de la página. La posición y el ancho del área de contenido
 * (que cambian al plegar la barra o el reproductor) se miden con un ResizeObserver y se publican como variables en
 * `.music-app`, solo cuando cambian: las usan esta franja y el buscador centrado.
 */
export default function ContentTopbar({ contentRef }) {
  const barRef = useRef(null)

  useEffect(() => {
    const content = contentRef.current
    const bar = barRef.current
    const shell = content?.closest('.music-app')
    if (!content || !bar || !shell) return undefined

    let frame = 0
    let lastOpacity = -1
    let scrollTop = content.scrollTop
    // Solo se escribe en el fotograma; la posición se lee en el evento de scroll, con el diseño ya calculado. Leerla
    // dentro del fotograma, después de que la cuadrícula de la Biblioteca monte filas, forzaba un recálculo del diseño
    // en cada fotograma (medido: 239 ms en un perfil de 12,9 s de scroll rápido).
    const paint = () => {
      frame = 0
      const opacity = Math.min(1, Math.max(0, scrollTop / FADE_PX))
      const rounded = Math.round(opacity * 100) / 100
      if (rounded !== lastOpacity) {
        lastOpacity = rounded
        bar.style.opacity = String(rounded)
      }
    }
    const onScroll = () => {
      // Fuera del Inicio la franja está oculta (sin buscador fijo): no hay nada que pintar.
      if (!shell.classList.contains('music-app--search-bar')) return
      scrollTop = content.scrollTop
      if (!frame) frame = requestAnimationFrame(paint)
    }

    let last = ''
    const measure = () => {
      const rect = content.getBoundingClientRect()
      const next = `${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.width)}`
      if (next === last) return
      last = next
      shell.style.setProperty('--content-left', `${Math.round(rect.left)}px`)
      shell.style.setProperty('--content-top', `${Math.round(rect.top)}px`)
      shell.style.setProperty('--content-width', `${Math.round(rect.width)}px`)
    }

    measure()
    paint()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    // El ancho del área cambia sin que cambie su tamaño propio al plegar la barra lateral (se desplaza): también se
    // observa el contenedor de toda la app.
    observer.observe(shell)
    content.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      content.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [contentRef])

  return <div className="content-topbar" ref={barRef} aria-hidden="true" />
}
