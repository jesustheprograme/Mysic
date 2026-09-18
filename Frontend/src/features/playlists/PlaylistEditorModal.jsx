import { useEffect, useMemo, useState } from 'react'
import { Check, Pin, X } from 'lucide-react'

function PlaylistEditorModal({ initialPlaylist, mode = 'create', onClose, onSave, playlists = [], songs }) {
  const [title, setTitle] = useState(initialPlaylist?.title ?? '')
  const [description, setDescription] = useState(initialPlaylist?.description ?? '')
  const [artwork, setArtwork] = useState(initialPlaylist?.artwork ?? songs[0]?.artwork ?? null)
  const [pinned, setPinned] = useState(Boolean(initialPlaylist?.pinned))
  const [error, setError] = useState('')
  const artworkOptions = useMemo(() => {
    const uniqueArtwork = new Set()
    return songs.filter((song) => {
      if (uniqueArtwork.has(song.artwork)) return false
      uniqueArtwork.add(song.artwork)
      return true
    }).slice(0, 8)
  }, [songs])
  const previewTitle = title.trim() || 'Mi playlist'
  const previewDescription = description.trim() || 'Tu seleccion para escuchar cuando quieras.'

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSubmit(event) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Escribe un nombre para la playlist.')
      return
    }

    onSave({ title: cleanTitle, description, artwork, pinned })
  }

  return (
    <dialog className="playlist-modal playlist-editor-modal" open aria-labelledby="playlist-editor-title">
      <section className="playlist-modal__panel">
        <div className="playlist-modal__header">
          <div>
            <span className="playlist-modal__eyebrow">{mode === 'create' ? 'Nueva playlist' : 'Editar playlist'}</span>
            <h2 id="playlist-editor-title">{mode === 'create' ? 'Crea tu playlist' : 'Edita tu playlist'}</h2>
            <p className="playlist-modal__intro">Personaliza los detalles y mira como se vera antes de guardarla.</p>
          </div>
          <button className="playlist-modal__close" type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="playlist-modal__body">
          <form className="playlist-editor" onSubmit={handleSubmit}>
            <section className="playlist-editor__section" aria-labelledby="playlist-info-title">
              <div className="playlist-editor__section-heading">
                <span>01</span>
                <div>
                  <strong id="playlist-info-title">Informaci&oacute;n</strong>
                  <small>Un nombre y una descripci&oacute;n para reconocerla.</small>
                </div>
              </div>
              <div className="playlist-editor__fields">
                <label className="playlist-editor__field">
                  <span>Nombre</span>
                  <input value={title} onChange={(event) => { setTitle(event.target.value); setError('') }} placeholder="Mi playlist" autoFocus />
                </label>
                <label className="playlist-editor__field">
                  <span>Descripci&oacute;n <em>Opcional</em></span>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Que quieres escuchar hoy?" rows={2} />
                </label>
              </div>
            </section>

            <section className="playlist-editor__section" aria-labelledby="playlist-cover-title">
              <div className="playlist-editor__section-heading">
                <span>02</span>
                <div>
                  <strong id="playlist-cover-title">Portada</strong>
                  <small>Elige una imagen existente del proyecto.</small>
                </div>
              </div>
              <div className="playlist-cover-editor">
                <div className="playlist-cover-editor__selected">
                  {artwork ? <img src={artwork} alt="Portada seleccionada" /> : <span />}
                </div>
                <div className="playlist-artwork-picker" role="listbox" aria-label="Elegir portada">
                  {artworkOptions.map((song) => (
                    <button
                      className={`playlist-artwork-picker__option${artwork === song.artwork ? ' playlist-artwork-picker__option--active' : ''}`}
                      type="button"
                      role="option"
                      aria-selected={artwork === song.artwork}
                      aria-label={`Portada de ${song.title}`}
                      key={song.artwork}
                      onClick={() => setArtwork(song.artwork)}
                    >
                      <img src={song.artwork} alt="" />
                      {artwork === song.artwork && <Check size={15} strokeWidth={2.5} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="playlist-editor__section playlist-editor__section--options" aria-labelledby="playlist-options-title">
              <div className="playlist-editor__section-heading">
                <span>03</span>
                <div>
                  <strong id="playlist-options-title">Opciones</strong>
                  <small>Haz que aparezca en el bloque principal de Inicio.</small>
                </div>
              </div>
              <label className="playlist-editor__switch">
                <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
                <span className="playlist-editor__switch-control"><Pin size={14} strokeWidth={2} aria-hidden="true" /></span>
                <span><strong>Fijar en Inicio</strong><small>Se mostrara antes que tus otras playlists.</small></span>
              </label>
            </section>

            {error && <p className="playlist-editor__error" role="alert">{error}</p>}
            <div className="playlist-editor__actions">
              <button className="playlist-button playlist-button--quiet" type="button" onClick={onClose}>Cancelar</button>
              <button className="playlist-button playlist-button--primary" type="submit">{mode === 'create' ? 'Crear playlist' : 'Guardar cambios'}</button>
            </div>
          </form>

          <aside className="playlist-modal__preview" aria-label="Vista previa de la playlist">
            <span className="playlist-modal__eyebrow">Vista previa</span>
            <div className="playlist-live-preview">
              {artwork ? <img src={artwork} alt="" /> : <span className="playlist-live-preview__empty" />}
              <div>
                <strong>{previewTitle}</strong>
                <p>{previewDescription}</p>
                <small>{mode === 'create' ? 'Nueva playlist' : `${initialPlaylist?.songIds.length ?? 0} canciones`}</small>
              </div>
            </div>
            <div className="playlist-modal__existing-heading">
              <h3>Tus playlists</h3>
              <span>{playlists.length}</span>
            </div>
            <div className="playlist-modal__preview-list">
              {playlists.length > 0 ? playlists.slice(0, 3).map((playlist) => (
                <div className="playlist-preview-item" key={playlist.id}>
                  {playlist.artwork ? <img src={playlist.artwork} alt="" /> : <span className="playlist-preview-item__empty" />}
                  <span>
                    <strong>{playlist.title}</strong>
                    <small>{playlist.songIds.length} canciones</small>
                  </span>
                </div>
              )) : <p className="playlist-modal__empty">Aun no tienes otras playlists.</p>}
            </div>
          </aside>
        </div>
      </section>
    </dialog>
  )
}

export default PlaylistEditorModal
