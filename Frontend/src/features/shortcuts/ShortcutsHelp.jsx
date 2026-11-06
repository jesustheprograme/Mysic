import { useEffect, useRef } from 'react'
import { SHORTCUTS } from './shortcuts.js'
import './shortcuts.css'

export default function ShortcutsHelp({ onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="shortcuts-title">Atajos de teclado</h2>
        <h3 className="shortcuts__group">General</h3>
        <dl>
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={keys}>
              <dt>{description}</dt>
              <dd><kbd>{keys}</kbd></dd>
            </div>
          ))}
        </dl>
        <button ref={closeRef} type="button" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}
