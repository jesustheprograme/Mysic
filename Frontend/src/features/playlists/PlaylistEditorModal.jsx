import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Globe2, ImagePlus, LockKeyhole, UserRound, X } from 'lucide-react'
import { playlistsApi } from '../../lib/api.js'

function validateArtwork(file) {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  const acceptedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLocaleLowerCase())
  const acceptedExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
  if (!acceptedType && !acceptedExtension) return 'La portada debe ser JPG, PNG o WEBP.'
  if (file.size > 10 * 1024 * 1024) return 'La portada no puede superar los 10 MB.'
  return ''
}

function usePlaylistEditor({ initialPlaylist, onClose, onSave, songs }) {
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
    const seen = new Set()
    return songs.filter((song) => {
      if (!song.artwork || seen.has(song.artwork)) return false
      seen.add(song.artwork)
      return true
    }).slice(0, 8)
  }, [songs])

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function clearArtworkSelection() {
    setArtworkFile(null)
    setArtworkPreview(null)
  }

  function handleArtworkChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const validationError = validateArtwork(file)
    if (validationError) {
      clearArtworkSelection()
      setArtworkError(validationError)
      return
    }
    setArtworkFile(file)
    setArtworkError('')
    setError('')
    const reader = new FileReader()
    reader.addEventListener('load', () => setArtworkPreview(typeof reader.result === 'string' ? reader.result : null), { once: true })
    reader.addEventListener('error', () => {
      clearArtworkSelection()
      setArtworkError('No se pudo leer la portada seleccionada.')
    }, { once: true })
    reader.readAsDataURL(file)
  }

  function selectExistingArtwork(nextArtwork) {
    setArtwork(nextArtwork)
    artworkPublicIdRef.current = null
    clearArtworkSelection()
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
        const uploaded = await playlistsApi.uploadArtwork(artworkFile)
        savedArtwork = uploaded.url
        savedArtworkPublicId = uploaded.publicId
        setArtwork(uploaded.url)
        artworkPublicIdRef.current = uploaded.publicId
        clearArtworkSelection()
      }
      await onSave({ title: cleanTitle, description: description.trim(), artwork: savedArtwork, artworkPublicId: savedArtworkPublicId })
    } catch (uploadError) {
      setError(uploadError.message || 'No se pudo subir la portada.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    artwork, artworkError, artworkFile, artworkOptions, artworkPreview, collaboration, description, error,
    handleArtworkChange, handleSubmit, selectExistingArtwork, setCollaboration, setDescription, setError,
    setTitle, setVisibility, submitting, title, visibility,
  }
}

function ArtworkEditor({ editor }) {
  const selectedArtwork = editor.artworkPreview || editor.artwork
  return (
    <>
      <div className="playlist-cover-editor">
        <label className="playlist-cover-editor__selected">
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Subir portada de playlist" onChange={editor.handleArtworkChange} />
          {selectedArtwork ? <img src={selectedArtwork} alt="Portada seleccionada" /> : <span className="playlist-cover-editor__placeholder"><ImagePlus size={30} strokeWidth={1.6} aria-hidden="true" /><strong>Elegir portada</strong></span>}
          <span className="playlist-cover-editor__upload-label"><ImagePlus size={13} aria-hidden="true" />{selectedArtwork ? 'Cambiar' : 'Subir'}</span>
        </label>
        <span className="playlist-cover-editor__label" title={editor.artworkFile?.name}>{editor.artworkFile ? editor.artworkFile.name : 'JPG, PNG o WEBP · máx. 10 MB'}</span>
        {editor.artworkOptions.length > 0 && (
          <div className="playlist-artwork-picker" role="listbox" aria-label="Elegir portada">
            {editor.artworkOptions.map((song) => {
              const selected = !editor.artworkFile && editor.artwork === song.artwork
              return <button className={`playlist-artwork-picker__option${selected ? ' playlist-artwork-picker__option--active' : ''}`} type="button" role="option" aria-selected={selected} aria-label={`Portada de ${song.title}`} key={song.artwork} onClick={() => editor.selectExistingArtwork(song.artwork)}><img src={song.artwork} alt="" />{selected && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}</button>
            })}
          </div>
        )}
      </div>
      {editor.artworkError && <p className="playlist-editor__artwork-error" role="alert">{editor.artworkError}</p>}
    </>
  )
}

function PlaylistSettings({ editor }) {
  const options = [
    ['public', 'Pública', Globe2],
    ['private', 'Privada', LockKeyhole],
    ['personal', 'Solo yo', UserRound],
  ]
  return (
    <>
      <fieldset className="playlist-editor__visibility">
        <legend>Visibilidad</legend>
        <div className="playlist-editor__visibility-options">
          {options.map(([value, label, Icon]) => <button className={editor.visibility === value ? 'is-active' : ''} type="button" aria-pressed={editor.visibility === value} key={value} onClick={() => editor.setVisibility(value)}><Icon size={14} aria-hidden="true" />{label}</button>)}
        </div>
        <small>Solo tú podrás ver esta playlist.</small>
      </fieldset>
      <div className="playlist-editor__collaboration">
        <span><strong>Permitir colaboración</strong><small>Otras personas podrán agregar canciones.</small></span>
        <button className={editor.collaboration ? 'is-active' : ''} type="button" role="switch" aria-checked={editor.collaboration} aria-label="Permitir colaboración" onClick={() => editor.setCollaboration((current) => !current)}><span /></button>
      </div>
    </>
  )
}

function PlaylistEditorModal({ initialPlaylist, mode = 'create', onClose, onSave, songs }) {
  const editor = usePlaylistEditor({ initialPlaylist, onClose, onSave, songs })
  const createMode = mode === 'create'
  return (
    <dialog className="playlist-modal playlist-editor-modal" open aria-labelledby="playlist-editor-title">
      <section className="playlist-modal__panel">
        <div className="playlist-modal__header">
          <div><h2 id="playlist-editor-title">{createMode ? 'Crear playlist' : 'Editar playlist'}</h2><p className="playlist-modal__intro">{createMode ? 'Crea una nueva playlist para tu música favorita.' : 'Actualiza los datos de tu playlist.'}</p></div>
          <button className="playlist-modal__close" type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose}><X size={20} strokeWidth={1.8} aria-hidden="true" /></button>
        </div>
        <div className="playlist-modal__body">
          <form className="playlist-editor playlist-editor--compact" onSubmit={editor.handleSubmit}>
            <ArtworkEditor editor={editor} />
            <label className="playlist-editor__field"><span>Nombre</span><input value={editor.title} maxLength={80} onChange={(event) => { editor.setTitle(event.target.value); editor.setError('') }} placeholder="Ej. Mis canciones favoritas" autoFocus /></label>
            <label className="playlist-editor__field"><span>Descripción <em>(opcional)</em></span><textarea value={editor.description} maxLength={300} onChange={(event) => editor.setDescription(event.target.value)} placeholder="Cuéntanos sobre esta playlist..." rows={3} /><small className="playlist-editor__counter">{editor.description.length}/300</small></label>
            <PlaylistSettings editor={editor} />
            {editor.error && <p className="playlist-editor__error" role="alert">{editor.error}</p>}
            <div className="playlist-editor__actions">
              <button className="playlist-button playlist-button--quiet" type="button" disabled={editor.submitting} onClick={onClose}>Cancelar</button>
              <button className="playlist-button playlist-button--primary" type="submit" disabled={editor.submitting}>{editor.submitting ? 'Guardando...' : createMode ? 'Crear playlist' : 'Guardar cambios'}</button>
            </div>
          </form>
        </div>
      </section>
    </dialog>
  )
}

export default PlaylistEditorModal
