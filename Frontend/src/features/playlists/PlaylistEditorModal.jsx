import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Globe2, ImagePlus, LockKeyhole, UserRound, X } from 'lucide-react'
import { playlistsApi } from '../../lib/api.js'

function PlaylistEditorModal({ initialPlaylist, mode = 'create', onClose, onSave, songs }) {
  const [title, setTitle] = useState(initialPlaylist?.title ?? '')
  const [description, setDescription] = useState(initialPlaylist?.description ?? '')
  const [artwork, setArtwork] = useState(initialPlaylist?.artwork ?? songs[0]?.artwork ?? null)
  const artworkPublicIdRef = useRef(initialPlaylist?.artworkPublicId ?? null)
  const [artworkFile, setArtworkFile] = useState(null)
  const [artworkPreview, setArtworkPreview] = useState(null)
  const [visibility, setVisibility] = useState('private')
  const [collaboration, setCollaboration] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [artworkError, setArtworkError] = useState('')
  const [error, setError] = useState('')
  const artworkOptions = useMemo(() => {
    const uniqueArtwork = new Set()
    return songs.filter((song) => {
      if (!song.artwork || uniqueArtwork.has(song.artwork)) return false
      uniqueArtwork.add(song.artwork)
      return true
    }).slice(0, 8)
  }, [songs])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleArtworkChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    const acceptedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLocaleLowerCase())
    const acceptedExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
    if (!acceptedType && !acceptedExtension) {
      setArtworkFile(null)
      setArtworkPreview(null)
      setArtworkError('La portada debe ser JPG, PNG o WEBP.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setArtworkFile(null)
      setArtworkPreview(null)
      setArtworkError('La portada no puede superar los 10 MB.')
      return
    }

    setArtworkFile(file)
    setArtworkError('')
    setError('')
    const reader = new FileReader()
    reader.addEventListener('load', () => setArtworkPreview(typeof reader.result === 'string' ? reader.result : null), { once: true })
    reader.addEventListener('error', () => {
      setArtworkFile(null)
      setArtworkPreview(null)
      setArtworkError('No se pudo leer la portada seleccionada.')
    }, { once: true })
    reader.readAsDataURL(file)
  }

  function selectExistingArtwork(nextArtwork) {
    setArtwork(nextArtwork)
    artworkPublicIdRef.current = null
    setArtworkFile(null)
    setArtworkPreview(null)
    setArtworkError('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Escribe un nombre para la playlist.')
      return
    }
    if (artworkError) return

    setSubmitting(true)
    setError('')
    try {
      let savedArtwork = artwork
      let savedArtworkPublicId = artworkPublicIdRef.current
      if (artworkFile) {
        const uploadedArtwork = await playlistsApi.uploadArtwork(artworkFile)
        savedArtwork = uploadedArtwork.url
        savedArtworkPublicId = uploadedArtwork.publicId
        setArtwork(uploadedArtwork.url)
        artworkPublicIdRef.current = uploadedArtwork.publicId
        setArtworkFile(null)
        setArtworkPreview(null)
      }
      await onSave({
        title: cleanTitle,
        description: description.trim(),
        artwork: savedArtwork,
        artworkPublicId: savedArtworkPublicId,
      })
    } catch (uploadError) {
      setError(uploadError.message || 'No se pudo subir la portada.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog className="playlist-modal playlist-editor-modal" open aria-labelledby="playlist-editor-title">
      <section className="playlist-modal__panel">
        <div className="playlist-modal__header">
          <div>
            <h2 id="playlist-editor-title">{mode === 'create' ? 'Crear playlist' : 'Editar playlist'}</h2>
            <p className="playlist-modal__intro">
              {mode === 'create' ? 'Crea una nueva playlist para tu música favorita.' : 'Actualiza los datos de tu playlist.'}
            </p>
          </div>
          <button className="playlist-modal__close" type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="playlist-modal__body">
          <form className="playlist-editor playlist-editor--compact" onSubmit={handleSubmit}>
            <div className="playlist-cover-editor">
              <label className="playlist-cover-editor__selected">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Subir portada de playlist"
                  onChange={handleArtworkChange}
                />
                {artworkPreview || artwork ? (
                  <img src={artworkPreview || artwork} alt="Portada seleccionada" />
                ) : (
                  <span className="playlist-cover-editor__placeholder">
                    <ImagePlus size={30} strokeWidth={1.6} aria-hidden="true" />
                    <strong>Elegir portada</strong>
                  </span>
                )}
                <span className="playlist-cover-editor__upload-label">
                  <ImagePlus size={13} aria-hidden="true" />
                  {artworkPreview || artwork ? 'Cambiar' : 'Subir'}
                </span>
              </label>
              <span className="playlist-cover-editor__label" title={artworkFile?.name}>
                {artworkFile ? artworkFile.name : 'JPG, PNG o WEBP · máx. 10 MB'}
              </span>
              {artworkOptions.length > 0 && (
                <div className="playlist-artwork-picker" role="listbox" aria-label="Elegir portada">
                  {artworkOptions.map((song) => (
                    <button
                      className={`playlist-artwork-picker__option${!artworkFile && artwork === song.artwork ? ' playlist-artwork-picker__option--active' : ''}`}
                      type="button"
                      role="option"
                      aria-selected={!artworkFile && artwork === song.artwork}
                      aria-label={`Portada de ${song.title}`}
                      key={song.artwork}
                      onClick={() => selectExistingArtwork(song.artwork)}
                    >
                      <img src={song.artwork} alt="" />
                      {!artworkFile && artwork === song.artwork && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {artworkError && <p className="playlist-editor__artwork-error" role="alert">{artworkError}</p>}

            <label className="playlist-editor__field">
              <span>Nombre</span>
              <input
                value={title}
                maxLength={80}
                onChange={(event) => { setTitle(event.target.value); setError('') }}
                placeholder="Ej. Mis canciones favoritas"
                autoFocus
              />
            </label>

            <label className="playlist-editor__field">
              <span>Descripción <em>(opcional)</em></span>
              <textarea
                value={description}
                maxLength={300}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Cuéntanos sobre esta playlist..."
                rows={3}
              />
              <small className="playlist-editor__counter">{description.length}/300</small>
            </label>

            <fieldset className="playlist-editor__visibility">
              <legend>Visibilidad</legend>
              <div className="playlist-editor__visibility-options">
                <button
                  className={visibility === 'public' ? 'is-active' : ''}
                  type="button"
                  aria-pressed={visibility === 'public'}
                  onClick={() => setVisibility('public')}
                >
                  <Globe2 size={14} aria-hidden="true" />
                  Pública
                </button>
                <button
                  className={visibility === 'private' ? 'is-active' : ''}
                  type="button"
                  aria-pressed={visibility === 'private'}
                  onClick={() => setVisibility('private')}
                >
                  <LockKeyhole size={14} aria-hidden="true" />
                  Privada
                </button>
                <button
                  className={visibility === 'personal' ? 'is-active' : ''}
                  type="button"
                  aria-pressed={visibility === 'personal'}
                  onClick={() => setVisibility('personal')}
                >
                  <UserRound size={14} aria-hidden="true" />
                  Solo yo
                </button>
              </div>
              <small>Solo tú podrás ver esta playlist.</small>
            </fieldset>

            <div className="playlist-editor__collaboration">
              <span>
                <strong>Permitir colaboración</strong>
                <small>Otras personas podrán agregar canciones.</small>
              </span>
              <button
                className={collaboration ? 'is-active' : ''}
                type="button"
                role="switch"
                aria-checked={collaboration}
                aria-label="Permitir colaboración"
                onClick={() => setCollaboration((current) => !current)}
              >
                <span />
              </button>
            </div>

            {error && <p className="playlist-editor__error" role="alert">{error}</p>}
            <div className="playlist-editor__actions">
              <button className="playlist-button playlist-button--quiet" type="button" disabled={submitting} onClick={onClose}>Cancelar</button>
              <button className="playlist-button playlist-button--primary" type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : mode === 'create' ? 'Crear playlist' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </dialog>
  )
}

export default PlaylistEditorModal
