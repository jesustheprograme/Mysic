import { Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

function PlaylistDeleteModal({ deleting, onCancel, onConfirm, playlist }) {
  return createPortal(
    <dialog
      className="playlist-modal playlist-delete-modal"
      open
      aria-labelledby="playlist-delete-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!deleting) onCancel()
      }}
    >
      <section className="playlist-delete-modal__panel">
        <button
          className="playlist-modal__close playlist-delete-modal__close"
          type="button"
          aria-label="Cerrar"
          disabled={deleting}
          onClick={onCancel}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className="playlist-delete-modal__icon" aria-hidden="true">
          <Trash2 size={23} strokeWidth={1.8} />
        </span>
        <h2 id="playlist-delete-title">¿Eliminar playlist?</h2>
        <p>
          <strong>{playlist.title}</strong> desaparecerá de tu biblioteca. Esta acción no se puede deshacer.
        </p>
        <div className="playlist-delete-modal__actions">
          <button className="playlist-button playlist-button--quiet" type="button" disabled={deleting} onClick={onCancel}>
            Cancelar
          </button>
          <button className="playlist-button playlist-delete-modal__confirm" type="button" disabled={deleting} onClick={onConfirm}>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </section>
    </dialog>,
    document.body,
  )
}

export default PlaylistDeleteModal
