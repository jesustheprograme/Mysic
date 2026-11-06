import { useCallback, useState } from 'react'
import { DEFAULT_LAYOUT, sanitizeLayout } from './homeLayout.js'

const STORAGE_KEY = 'mysic:youtube:home-layout:v1'

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return sanitizeLayout(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitizeLayout(null)
  }
}

function write(layout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Sin almacenamiento (modo privado, cuota): el cambio sigue valiendo durante la sesión.
  }
}

/** Configuración del inicio guardada en este equipo. `update` recibe el valor actual y devuelve el nuevo. */
export default function useHomeLayout() {
  const [layout, setLayout] = useState(read)

  const update = useCallback((change) => {
    setLayout((current) => {
      const next = sanitizeLayout(typeof change === 'function' ? change(current) : change)
      write(next)
      return next
    })
  }, [])

  const reset = useCallback(() => update({ ...DEFAULT_LAYOUT, hidden: [], order: [] }), [update])

  return { layout, reset, update }
}
