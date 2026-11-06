import { isTauri } from '@tauri-apps/api/core'

/**
 * ¿Se ejecuta dentro de la ventana principal de la app de escritorio (Tauri)?
 * Mismo criterio que lib/api.js. En escritorio la ventana no tiene barra nativa (`decorations: false`),
 * así que la interfaz dibuja la suya (TitleBar). En la web no hay nada que dibujar.
 */
export function isDesktopShell() {
  if (typeof window === 'undefined') return false
  return isTauri() || Boolean(window.__TAURI_INTERNALS__)
}
