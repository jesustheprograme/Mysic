import { useEffect, useRef, useState } from 'react'
import * as musicImportApi from './musicImportApi.js'
import './music-import.css'

const STATUS_LABELS = {
  pending: 'Pendiente',
  analyzing: 'Analizando',
  ready: 'Lista',
  error: 'Error',
  processed: 'Procesado',
  skipped: 'Omitido',
}

function StatusBadge({ status }) {
  return <span className={`mi-status mi-status--${status}`}>{STATUS_LABELS[status] ?? status}</span>
}

function ConfidenceBar({ confidence }) {
  if (!confidence) return <span className="mi-muted">—</span>
  const percent = Math.round(confidence * 100)
  return (
    <div className="mi-confidence">
      <div className="mi-confidence__bar" style={{ width: `${percent}%` }} />
      <span>{percent}%</span>
    </div>
  )
}

function MusicImportView() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [editFolder, setEditFolder] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const fileInputRef = useRef(null)

  async function loadState() {
    try {
      const raw = await musicImportApi.readMusicImportState()
      const data = JSON.parse(raw)
      setEntries(data.entries ?? [])
    } catch {
      setEntries([])
    }
  }

  useEffect(() => {
    loadState()
  }, [])

  async function handleFiles(files) {
    if (!files.length) return
    setLoading(true)
    setError('')
    try {
      const paths = Array.from(files).map((f) => f.path || f.webkitRelativePath || f.name)
      const staged = await musicImportApi.stageMusicFiles(paths)
      await loadState()
      if (staged.length === 0) {
        setError('No se encontraron archivos .mp3 para importar.')
      }
    } catch (err) {
      setError(err.message || 'Error al agregar archivos.')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  function onDragOver(e) {
    e.preventDefault()
    setDragActive(true)
  }

  function onDragLeave() {
    setDragActive(false)
  }

  async function handleFileInput(e) {
    handleFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    setPreviewResult(null)
    setImportResult(null)
    try {
      const raw = await musicImportApi.analyzeMusicImport()
      const result = JSON.parse(raw)
      await loadState()
      return result
    } catch (err) {
      setError(err.message || 'Error al analizar.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewResult(null)
    try {
      const raw = await musicImportApi.previewMusicImport()
      const result = JSON.parse(raw)
      setPreviewResult(result)
    } catch (err) {
      setError(err.message || 'Error en vista previa.')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    try {
      const raw = await musicImportApi.applyMusicImport()
      const result = JSON.parse(raw)
      setImportResult(result)
      await loadState()
    } catch (err) {
      setError(err.message || 'Error al importar.')
    } finally {
      setImporting(false)
    }
  }

  function openEditModal(entry) {
    setEditingRow(entry.file)
    setEditFolder(entry.cloudinaryFolder || '')
    setEditArtist(entry.metadata?.artist || '')
    setEditTitle(entry.metadata?.title || '')
  }

  async function saveEdit(entry) {
    try {
      const raw = await musicImportApi.readMusicImportState()
      const data = JSON.parse(raw)
      const target = data.entries.find((e) => e.file === entry.file)
      if (target) {
        if (editFolder) target.cloudinaryFolder = editFolder
        if (editArtist) {
          target.metadata = target.metadata || {}
          target.metadata.artist = editArtist
        }
        if (editTitle) {
          target.metadata = target.metadata || {}
          target.metadata.title = editTitle
        }
        target.status = 'ready'
        target.error = null
        await musicImportApi.saveMusicImport(JSON.stringify(data))
        await loadState()
      }
      setEditingRow(null)
    } catch (err) {
      setError(err.message || 'Error al guardar cambios.')
    }
  }

  const hasReady = entries.some((e) => e.status === 'ready' && e.cloudinaryFolder)
  const _hasErrors = entries.some((e) => e.status === 'error')
  const pendingCount = entries.filter((e) => e.status === 'pending' || e.status === 'error').length
  const readyCount = entries.filter((e) => e.status === 'ready').length

  return (
    <div className="mi-page">
      <header className="mi-header">
        <h1>Importar música</h1>
        <p>Arrastra MP3, identifícalos con MusicBrainz y importarlos a tu biblioteca.</p>
      </header>

      {error && (
        <div className="mi-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}

      <div
        className={`mi-dropzone${dragActive ? ' mi-dropzone--active' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Arrastra archivos MP3 o haz clic para seleccionar"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3"
          multiple
          className="mi-file-input"
          onChange={handleFileInput}
        />
        <div className="mi-dropzone__icon">⬆</div>
        <div className="mi-dropzone__text">
          Arrastra archivos MP3 aquí o haz clic para buscar
        </div>
      </div>

      {entries.length > 0 && (
        <div className="mi-stats">
          <span>{entries.length} archivos</span>
          <span>{pendingCount} pendientes</span>
          <span>{readyCount} listas</span>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mi-actions">
          <button
            className="mi-btn mi-btn--primary"
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || loading}
          >
            {analyzing ? 'Analizando…' : 'Analizar'}
          </button>
          <button
            className="mi-btn mi-btn--secondary"
            type="button"
            onClick={handlePreview}
            disabled={previewing || !hasReady}
          >
            {previewing ? 'Vista previa…' : 'Vista previa'}
          </button>
          <button
            className="mi-btn mi-btn--accent"
            type="button"
            onClick={handleImport}
            disabled={importing || !hasReady}
          >
            {importing ? 'Importando…' : `Importar seleccionadas (${readyCount})`}
          </button>
        </div>
      )}

      {previewResult && (
        <div className="mi-preview-result">
          <h3>Vista previa</h3>
          <pre>{JSON.stringify(previewResult, null, 2)}</pre>
        </div>
      )}

      {importResult && (
        <div className="mi-import-result">
          <h3>Importación completada</h3>
          <pre>{JSON.stringify(importResult, null, 2)}</pre>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Portada</th>
                <th>Artista</th>
                <th>Título</th>
                <th>Álbum</th>
                <th>Año</th>
                <th>Género</th>
                <th>Pista</th>
                <th>Confianza</th>
                <th>Carpeta Cloudinary</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.file} className={`mi-row mi-row--${entry.status}`}>
                  <td className="mi-file">{entry.file}</td>
                  <td>
                    {entry.embeddedCover ? '✓' : '—'}
                  </td>
                  <td>{editingRow === entry.file ? (
                    <input
                      className="mi-edit"
                      value={editArtist}
                      onChange={(e) => setEditArtist(e.target.value)}
                      placeholder="Artista"
                    />
                  ) : (
                    entry.metadata?.artist || '—'
                  )}</td>
                  <td>{editingRow === entry.file ? (
                    <input
                      className="mi-edit"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Título"
                    />
                  ) : (
                    entry.metadata?.title || '—'
                  )}</td>
                  <td>{entry.metadata?.album || '—'}</td>
                  <td>{entry.metadata?.year || '—'}</td>
                  <td>{entry.metadata?.genres?.join(', ') || '—'}</td>
                  <td>{entry.metadata?.trackNumber || '—'}</td>
                  <td><ConfidenceBar confidence={entry.metadata?.confidence} /></td>
                  <td>
                    {editingRow === entry.file ? (
                      <div className="mi-edit-row">
                        <input
                          className="mi-edit"
                          value={editFolder}
                          onChange={(e) => setEditFolder(e.target.value)}
                          placeholder="artistas/album"
                        />
                        <button
                          className="mi-btn mi-btn--small"
                          type="button"
                          onClick={() => saveEdit(entry)}
                        >
                          Guardar
                        </button>
                      </div>
                    ) : entry.cloudinaryFolder ? (
                      <span className="mi-folder">{entry.cloudinaryFolder}</span>
                    ) : (
                      <span className="mi-muted">Sin carpeta</span>
                    )}
                  </td>
                  <td><StatusBadge status={entry.status} /></td>
                  <td>
                    {entry.error && (
                      <span className="mi-error-text" title={entry.error}>{entry.error}</span>
                    )}
                    {entry.status === 'error' && (
                      <button
                        className="mi-btn mi-btn--small"
                        type="button"
                        onClick={() => openEditModal(entry)}
                      >
                        Editar
                      </button>
                    )}
                    {entry.status === 'ready' && !entry.cloudinaryFolder && (
                      <button
                        className="mi-btn mi-btn--small"
                        type="button"
                        onClick={() => openEditModal(entry)}
                      >
                        Asignar
                      </button>
                    )}
                    {entry.cloudinaryFolder && entry.status === 'ready' && (
                      <button
                        className="mi-btn mi-btn--small"
                        type="button"
                        onClick={() => {
                          setEditingRow(entry.file)
                          setEditFolder(entry.cloudinaryFolder)
                          setEditArtist(entry.metadata?.artist || '')
                          setEditTitle(entry.metadata?.title || '')
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && !loading && (
        <div className="mi-empty">
          Agrega archivos MP3 para comenzar la importación.
        </div>
      )}
    </div>
  )
}

export default MusicImportView
