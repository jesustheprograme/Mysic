import { useSyncExternalStore } from 'react'

// Menú contextual único de la app: cualquier elemento lo abre con `onContextMenu={ctxMenu(kind, entry)}` y un solo
// <ContextMenuHost /> lo pinta en el cursor. Así no hay un menú (ni un oyente) montado por cada tarjeta o fila.
let state = null
const listeners = new Set()

function set(next) {
  state = next
  listeners.forEach((listener) => listener())
}

/** Manejador de clic derecho para un elemento de tipo `kind` ('song' | 'album' | 'playlist' | 'artist'). */
export const ctxMenu = (kind, entry) => (event) => {
  if (!entry?.id) return
  event.preventDefault()
  event.stopPropagation()
  set({ entry, kind, x: event.clientX, y: event.clientY })
}

/** Abre el menú en un punto concreto (el botón "…" de una fila lo abre bajo sí mismo). */
export function openContextMenu(kind, entry, point) {
  if (entry?.id) set({ entry, kind, x: point.x, y: point.y })
}

export const closeContextMenu = () => { if (state) set(null) }

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Menú abierto ahora: { kind, entry, x, y } o null. */
export const useContextMenu = () => useSyncExternalStore(subscribe, () => state)
