// Avisos breves ("Enlace copiado", "Añadida a la cola"). Un único aviso a la vez; el nuevo reemplaza al anterior.

let current = null
let timer = null
const listeners = new Set()

function emit(next) {
  current = next
  listeners.forEach((listener) => listener())
}

export function showToast(message, { durationMs = 2200 } = {}) {
  clearTimeout(timer)
  const toast = { id: Date.now() + Math.random(), message }
  emit(toast)
  timer = setTimeout(() => { if (current === toast) emit(null) }, durationMs)
}

export const subscribeToast = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getToast = () => current