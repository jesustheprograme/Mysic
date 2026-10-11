import { useEffect, useState } from 'react'
import * as musicImportApi from '../musicImportApi.js'
import { formatMusicImportError, parseMusicImportResponse } from '../musicImportErrors.js'

const ACQUISITION_TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])
const ACQUISITION_JOB_KEY = 'mysic.acquisitionJob'

export default function useImportacionMusica(onCatalogRefresh) {
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
  const pendingCount = entries.filter((e) => e.status === 'pending' || e.status === 'error').length
  const readyCount = entries.filter((e) => e.status === 'ready').length

  return {
    acquisitionJob,
    analyzing,
    cancellingAcquisition,
    deletingRow,
    dragActive,
    editingRow,
    editArtist,
    editFolder,
    editTitle,
    entries,
    error,
    handleAnalyze,
    handleCancelAcquisition,
    handleImport,
    handlePickFiles,
    handlePrepareUrls,
    handlePreview,
    handleRemove,
    hasReady,
    importing,
    importResult,
    loading,
    onDragLeave,
    onDragOver,
    onDrop,
    openEditModal,
    pendingCount,
    previewing,
    previewResult,
    readyCount,
    rightsConfirmed,
    saveEdit,
    setEditArtist,
    setEditFolder,
    setEditTitle,
    setError,
    setImportResult,
    setPreviewResult,
    setRightsConfirmed,
    setSourceUrls,
    sourceUrls,
    startingAcquisition,
  }
}
