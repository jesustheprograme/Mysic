export default function ControlesImportacion({
  analyzing,
  dragActive,
  entries,
  hasReady,
  importing,
  importResult,
  loading,
  onAnalyze,
  onCloseImportResult,
  onClosePreviewResult,
  onDragLeave,
  onDragOver,
  onDrop,
  onImport,
  onPickFiles,
  onPreview,
  previewing,
  previewResult,
  readyCount,
  pendingCount,
}) {
  return (
    <>
      <div
        className={`mi-dropzone${dragActive ? ' mi-dropzone--active' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onPickFiles}
        role="button"
        tabIndex={0}
        aria-label="Arrastra archivos MP3 o haz clic para seleccionar"
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onPickFiles() }}
      >
        <div className="mi-dropzone__icon">⬆</div>
        <div className="mi-dropzone__text">{loading ? 'Seleccionando archivos…' : 'Arrastra archivos MP3 aquí o haz clic para buscar'}</div>
      </div>

      {entries.length > 0 && <div className="mi-stats"><span>{entries.length} archivos</span><span>{pendingCount} pendientes</span><span>{readyCount} listas</span></div>}

      {entries.length > 0 && (
        <div className="mi-actions">
          <button className="mi-btn mi-btn--primary" type="button" onClick={onAnalyze} disabled={analyzing || loading}>{analyzing ? 'Analizando…' : 'Analizar'}</button>
          <button className="mi-btn mi-btn--secondary" type="button" onClick={onPreview} disabled={previewing || !hasReady}>{previewing ? 'Vista previa…' : 'Vista previa'}</button>
          <button className="mi-btn mi-btn--accent" type="button" onClick={onImport} disabled={importing || !hasReady}>{importing ? 'Importando…' : `Importar seleccionadas (${readyCount})`}</button>
        </div>
      )}

      {previewResult && (
        <div className="mi-preview-result">
          <h3>Vista previa</h3>
          <button className="mi-result-close" type="button" aria-label="Cerrar vista previa" onClick={onClosePreviewResult}>×</button>
          <pre>{JSON.stringify(previewResult, null, 2)}</pre>
        </div>
      )}

      {importResult && (
        <div className="mi-import-result">
          <h3>Importación completada</h3>
          <button className="mi-result-close" type="button" aria-label="Cerrar resultado de importación" onClick={onCloseImportResult}>×</button>
          <pre>{JSON.stringify(importResult, null, 2)}</pre>
        </div>
      )}

      {entries.length === 0 && !loading && <div className="mi-empty">Agrega archivos MP3 para comenzar la importación.</div>}
    </>
  )
}
