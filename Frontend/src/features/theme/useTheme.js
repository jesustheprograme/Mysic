import { useCallback, useEffect, useState } from 'react'
import { loadLightTheme } from './lightSheet.js'
import { applyTheme, nextTheme, normalizeTheme, readStoredTheme, storeTheme, THEME_KEY, THEME_TRANSITION_MS } from './themeModel.js'

let switchingTimer = null

/**
 * Cambia el tema con un fundido suave. Dos vías:
 *  1. View Transitions (WebView2/Chromium): el navegador congela una imagen de la pantalla, aplica el tema una sola vez y
 *     funde entre las dos imágenes en la GPU. Cuesta un único recálculo de estilos.
 *  2. Respaldo: la clase .theme-switching activa `transition-colors duration-300` en todos los elementos (index.css).
 *     Es fiel pero caro (una transición por elemento y propiedad: ~0,7 s de estilos en el Inicio), por eso solo es respaldo
 *     y la clase existe únicamente durante el fundido.
 */
async function switchTheme(theme) {
  const root = document.documentElement
  // La hoja clara llega antes de aplicar el tema: así el fundido nunca muestra una página a medio estilizar.
  if (theme === 'light') await loadLightTheme()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    applyTheme(theme)
    return
  }
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => applyTheme(theme))
    return
  }
  window.clearTimeout(switchingTimer)
  root.classList.add('theme-switching')
  applyTheme(theme)
  switchingTimer = window.setTimeout(() => root.classList.remove('theme-switching'), THEME_TRANSITION_MS + 80)
}
/** Tema actual y alternador. Se sincroniza con otras ventanas de Mysic (p. ej. el mini reproductor) por el almacenamiento. */
export default function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== THEME_KEY) return
      const next = normalizeTheme(event.newValue)
      setTheme(next)
      switchTheme(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback(() => {
    const next = nextTheme(theme)
    storeTheme(next)
    setTheme(next)
    switchTheme(next)
  }, [theme])

  return { theme, toggle }
}