import { useEffect, useState } from 'react'

/**
 * ¿Se está usando el mini reproductor? Sí mientras el puntero está encima o la ventana tiene el foco. Si no, la
 * tarjeta se ve medio transparente para no tapar lo que hay detrás (ver `.mini-player--reposo`).
 */
export function useMiniEnUso() {
  const [enUso, setEnUso] = useState(() => document.hasFocus() || document.documentElement.matches(':hover'))
  useEffect(() => {
    const root = document.documentElement
    let hovered = root.matches(':hover')
    let focused = document.hasFocus()
    const update = () => setEnUso(hovered || focused)
    const enter = () => { hovered = true; update() }
    const leave = () => { hovered = false; update() }
    const focus = () => { focused = true; update() }
    const blur = () => { focused = false; update() }
    root.addEventListener('pointerenter', enter)
    root.addEventListener('pointerleave', leave)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', blur)
    return () => {
      root.removeEventListener('pointerenter', enter)
      root.removeEventListener('pointerleave', leave)
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return enUso
}
