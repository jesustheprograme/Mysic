import { useEffect, useState } from 'react'
import * as musicImportApi from './musicImportApi.js'
import { formatMusicImportError, parseMusicImportResponse } from './musicImportErrors.js'
import './music-import.css'

const STATUS_LABELS = {
  pending: 'Pendiente',
  analyzing: 'Analizando',
  ready: 'Lista',
  error: 'Error',
  processed: 'Procesado',
  skipped: 'Omitido',
}

const ACQUISITION_TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])
const ACQUISITION_JOB_KEY = 'mysic.acquisitionJob'

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

function MusicImportView({ onCatalogRefresh }) {
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
  const [deletingRow, setDeletingRow] = useState(null)
  const [editFolder, setEditFolder] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [sourceUrls, setSourceUrls] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [acquisitionJob, setAcquisitionJob] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(ACQUISITION_JOB_KEY))
    } catch {
      return null
    }
  })
  const [startingAcquisition, setStartingAcquisition] = useState(false)
  const [cancellingAcquisition, setCancellingAcquisition] = useState(false)

  function reportError(operation, error, fallback) {
    console.error(`[Importar música] ${operation}`, error)
    setError(formatMusicImportError(error, fallback))
  }

  async function loadState() {
    try {
      const raw = await musicImportApi.readMusicImportState()
      const data = parseMusicImportResponse(raw)
      setEntries(data.entries ?? [])
    } catch {
      setEntries([])
    }
  }

  useEffect(() => {
    loadState()
    const refreshTimer = window.setInterval(loadState, 5000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  useEffect(() => {
    if (acquisitionJob?.id) window.localStorage.setItem(ACQUISITION_JOB_KEY, JSON.stringify(acquisitionJob))
    else window.localStorage.removeItem(ACQUISITION_JOB_KEY)
  }, [acquisitionJob])

  useEffect(() => {
    if (!acquisitionJob?.id || ACQUISITION_TERMINAL_STATUSES.has(acquisitionJob.status)) return undefined
    let cancelled = false
    let timer
    const poll = async () => {
      try {
        const raw = await musicImportApi.readMusicAcquisition(acquisitionJob.id)
        const next = parseMusicImportResponse(raw)
        if (cancelled) return
        setError('')
        setAcquisitionJob(next)
        if (ACQUISITION_TERMINAL_STATUSES.has(next.status)) await loadState()
      } catch (err) {
        if (!cancelled) reportError('No se pudo consultar la adquisición.', err, 'No se pudo consultar el trabajo de n8n.')
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2000)
      }
    }
    timer = window.setTimeout(poll, 2000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [acquisitionJob])

  async function handlePrepareUrls() {
    const urls = [...new Set(sourceUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))]
    if (urls.length === 0) {
      setError('Pega al menos un enlace, uno por línea.')
      return
    }
    if (!rightsConfirmed) {
      setError('Debes confirmar que el contenido es propio o que tienes autorización para descargarlo.')
      return
    }
    setStartingAcquisition(true)
    setError('')
    try {
      const raw = await musicImportApi.createMusicAcquisition(urls, true)
      setAcquisitionJob(parseMusicImportResponse(raw))
    } catch (err) {
      reportError('No se pudo iniciar la adquisición.', err, 'No se pudo conectar con n8n.')
    } finally {
      setStartingAcquisition(false)
    }
  }

  async function handleCancelAcquisition() {
    if (!acquisitionJob?.id) return
    setCancellingAcquisition(true)
    try {
      const raw = await musicImportApi.cancelMusicAcquisition(acquisitionJob.id)
      setAcquisitionJob(parseMusicImportResponse(raw))
      await loadState()
    } catch (err) {
      reportError('No se pudo cancelar la adquisición.', err, 'No se pudo cancelar el trabajo.')
    } finally {
      setCancellingAcquisition(false)
    }
  }

  async function handlePickFiles() {
    setLoading(true)
    setError('')
    try {
      const paths = await musicImportApi.pickMusicFiles()
      if (!paths || paths.length === 0) return
      const staged = await musicImportApi.stageMusicFiles(paths)
      await loadState()
      if (staged.length === 0) {
        setError('No se encontraron archivos .mp3 para importar.')
      }
    } catch (err) {
      reportError('No se pudieron agregar los archivos.', err, 'Error al agregar archivos.')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
  }

  function onDragOver(e) {
    e.preventDefault()
    setDragActive(true)
  }

  function onDragLeave() {
    setDragActive(false)
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    setPreviewResult(null)
    setImportResult(null)
    try {
      const raw = await musicImportApi.analyzeMusicImport()
      const result = parseMusicImportResponse(raw)
      await loadState()
      return result
    } catch (err) {
      reportError('Falló el análisis de metadatos.', err, 'Error al analizar.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewResult(null)
    try {
      const raw = await musicImportApi.previewMusicImport()
      const result = parseMusicImportResponse(raw)
      setPreviewResult(result)
    } catch (err) {
      reportError('Falló la vista previa.', err, 'Error en vista previa.')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    try {
      const raw = await musicImportApi.applyMusicImport()
      const result = parseMusicImportResponse(raw)
      await onCatalogRefresh?.()
      setImportResult(result)
      await loadState()
    } catch (err) {
      reportError('Falló la importación.', err, 'Error al importar.')
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
      const data = parseMusicImportResponse(raw)
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
      reportError('No se pudieron guardar los cambios.', err, 'Error al guardar cambios.')
    }
  }

  async function handleRemove(entry) {
    if (!window.confirm(`¿Eliminar ${entry.file} de la importación? También se borrará la copia preparada.`)) return
    setDeletingRow(entry.file)
    setError('')
    try {
      await musicImportApi.removeMusicImport(entry.file)
      if (editingRow === entry.file) setEditingRow(null)
      await loadState()
    } catch (err) {
      reportError('No se pudo eliminar la fila.', err, 'Error al eliminar la fila.')
    } finally {
      setDeletingRow(null)
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
        <p>Identifica los MP3, asigna la portada de Cloudinary y súbelos a la carpeta correcta del servidor.</p>
      </header>

      {error && (
        <div className="mi-error" role="alert">
          <span className="mi-error__message">{error}</span>
          <button type="button" aria-label="Cerrar mensaje de error" onClick={() => setError('')}>×</button>
        </div>
      )}

      <section className="mi-acquisition" aria-labelledby="mi-acquisition-title">
        <div className="mi-acquisition__heading">
          <div>
            <h2 id="mi-acquisition-title">Preparar desde enlaces</h2>
            <p>Un enlace por línea. n8n y el worker solo preparan los MP3; tú decides cuándo analizarlos e importarlos.</p>
          </div>
          <span className="mi-acquisition__format">MP3 · 192 kbps</span>
        </div>
        <textarea
          className="mi-acquisition__urls"
          value={sourceUrls}
          onChange={(event) => setSourceUrls(event.target.value)}
          placeholder={'https://music.youtube.com/playlist?list=…\nhttps://youtu.be/…'}
          rows={4}
          disabled={startingAcquisition || (acquisitionJob && !ACQUISITION_TERMINAL_STATUSES.has(acquisitionJob.status))}
          aria-label="Enlaces autorizados"
        />
        <label className="mi-acquisition__rights">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
            disabled={startingAcquisition}
          />
          Confirmo que el contenido es mío, libre o que tengo autorización para descargarlo.
        </label>
        <div className="mi-acquisition__actions">
          <button
            className="mi-btn mi-btn--primary"
            type="button"
            onClick={handlePrepareUrls}
            disabled={startingAcquisition || !rightsConfirmed || (acquisitionJob && !ACQUISITION_TERMINAL_STATUSES.has(acquisitionJob.status))}
          >
            {startingAcquisition ? 'Enviando a n8n…' : 'Preparar desde enlaces'}
          </button>
          {acquisitionJob && !ACQUISITION_TERMINAL_STATUSES.has(acquisitionJob.status) && (
            <button className="mi-btn mi-btn--danger" type="button" onClick={handleCancelAcquisition} disabled={cancellingAcquisition}>
              {cancellingAcquisition ? 'Cancelando…' : 'Cancelar'}
            </button>
          )}
        </div>
        {acquisitionJob && (
          <div className={`mi-acquisition-job mi-acquisition-job--${acquisitionJob.status}`}>
            <div className="mi-acquisition-job__summary">
              <strong>{acquisitionJob.status}</strong>
              <span>{acquisitionJob.progress?.completed ?? 0} de {acquisitionJob.progress?.total ?? 0} enlaces</span>
              <span>{acquisitionJob.results?.filter((item) => item.status === 'staged').length ?? 0} MP3 preparados</span>
            </div>
            <progress value={acquisitionJob.progress?.completed ?? 0} max={acquisitionJob.progress?.total || 1} />
            {acquisitionJob.currentUrl && <div className="mi-acquisition-job__current" title={acquisitionJob.currentUrl}>{acquisitionJob.currentUrl}</div>}
            {acquisitionJob.errors?.length > 0 && (
              <ul className="mi-acquisition-job__errors">
                {acquisitionJob.errors.map((item) => (
                  <li key={`${item.url || 'error'}-${item.file || ''}-${item.message}`}>{item.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div
        className={`mi-dropzone${dragActive ? ' mi-dropzone--active' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={handlePickFiles}
        role="button"
        tabIndex={0}
        aria-label="Arrastra archivos MP3 o haz clic para seleccionar"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePickFiles() }}
      >
        <div className="mi-dropzone__icon">⬆</div>
        <div className="mi-dropzone__text">
          {loading ? 'Seleccionando archivos…' : 'Arrastra archivos MP3 aquí o haz clic para buscar'}
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
          <button
            className="mi-result-close"
            type="button"
            aria-label="Cerrar vista previa"
            onClick={() => setPreviewResult(null)}
          >
            ×
          </button>
          <pre>{JSON.stringify(previewResult, null, 2)}</pre>
        </div>
      )}

      {importResult && (
        <div className="mi-import-result">
          <h3>Importación completada</h3>
          <button
            className="mi-result-close"
            type="button"
            aria-label="Cerrar resultado de importación"
            onClick={() => setImportResult(null)}
          >
            ×
          </button>
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
                <th>Destino servidor</th>
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
                      aria-label={`Artista de ${entry.file}`}
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
                      aria-label={`Título de ${entry.file}`}
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
                          aria-label={`Carpeta Cloudinary de ${entry.file}`}
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
                  <td>
                    {entry.remoteDestination ? (
                      <span className="mi-folder" title={entry.remoteDestination}>{entry.remoteDestination}</span>
                    ) : (
                      <span className="mi-muted">Se calcula al analizar</span>
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
                    <button
                      className="mi-btn mi-btn--small mi-btn--danger"
                      type="button"
                      disabled={deletingRow === entry.file || analyzing || importing}
                      onClick={() => handleRemove(entry)}
                    >
                      {deletingRow === entry.file ? 'Eliminando…' : 'Eliminar'}
                    </button>
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
