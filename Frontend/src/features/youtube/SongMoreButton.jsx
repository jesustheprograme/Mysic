import { MoreHorizontal } from 'lucide-react'
import { openContextMenu } from './contextMenuStore.js'
import './song-more-button.css'

/**
 * "…" al final de una fila de canción (como limusic): abre bajo el botón el mismo menú que el clic derecho, que pinta
 * un solo ContextMenuHost para toda la vista. Solo para canciones de YouTube (el menú es el de YouTube).
 */
export default function SongMoreButton({ className = '', song }) {
  if (!song?.id || (song.source && song.source !== 'youtube')) return null
  return (
    <button
      aria-haspopup="menu"
      aria-label={`Más opciones de ${song.title}`}
      className={`song-more ${className}`.trim()}
      onClick={(event) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        // Bajo el botón y alineado a su borde derecho (el menú se recoloca solo si no cabe).
        openContextMenu('song', song, { x: Math.round(rect.right - 212), y: Math.round(rect.bottom + 4) })
      }}
      title="Más opciones"
      type="button"
    >
      <MoreHorizontal size={17} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
