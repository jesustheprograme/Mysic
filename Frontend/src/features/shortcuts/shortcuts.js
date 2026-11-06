export const SHORTCUTS = [
  { keys: 'Ctrl + K', description: 'Buscar' },
  { keys: 'Ctrl + H  o  ?', description: 'Mostrar esta ayuda' },
  { keys: 'Esc', description: 'Cerrar búsqueda, menús y ayuda' },
]

function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false
  const tag = String(target.tagName ?? '').toUpperCase()
  return target.isContentEditable === true || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Traduce un evento de teclado a una acción global: 'search', 'help' o null.
 * Ctrl/Cmd+K y Ctrl/Cmd+H funcionan siempre; `?` solo si no se está escribiendo.
 */
export function matchShortcut(event) {
  if (!event || event.altKey || event.defaultPrevented) return null
  const key = String(event.key ?? '').toLowerCase()
  const modifier = event.ctrlKey || event.metaKey

  if (modifier && !event.shiftKey && key === 'k') return 'search'
  if (modifier && !event.shiftKey && key === 'h') return 'help'
  if (!modifier && key === '?' && !isTypingTarget(event.target)) return 'help'
  return null
}
