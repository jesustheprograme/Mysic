import ControlesImportacion from './componentes/ControlesImportacion.jsx'
import PanelAdquisicion from './componentes/PanelAdquisicion.jsx'
import TablaImportacion from './componentes/TablaImportacion.jsx'
import useImportacionMusica from './estado/useImportacionMusica.js'
import './music-import.css'

function MusicImportView({ onCatalogRefresh }) {
  const {
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
  } = useImportacionMusica(onCatalogRefresh)

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

      <PanelAdquisicion
        acquisitionJob={acquisitionJob}
        cancellingAcquisition={cancellingAcquisition}
        onCancel={handleCancelAcquisition}
        onPrepare={handlePrepareUrls}
        onRightsChange={setRightsConfirmed}
        onUrlsChange={setSourceUrls}
        rightsConfirmed={rightsConfirmed}
        sourceUrls={sourceUrls}
        startingAcquisition={startingAcquisition}
      />

      <ControlesImportacion
        analyzing={analyzing}
        dragActive={dragActive}
        entries={entries}
        hasReady={hasReady}
        importing={importing}
        importResult={importResult}
        loading={loading}
        onAnalyze={handleAnalyze}
        onCloseImportResult={() => setImportResult(null)}
        onClosePreviewResult={() => setPreviewResult(null)}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onImport={handleImport}
        onPickFiles={handlePickFiles}
        onPreview={handlePreview}
        pendingCount={pendingCount}
        previewing={previewing}
        previewResult={previewResult}
        readyCount={readyCount}
      />

      {entries.length > 0 && (
        <TablaImportacion
          analyzing={analyzing}
          deletingRow={deletingRow}
          editingRow={editingRow}
          editArtist={editArtist}
          editFolder={editFolder}
          editTitle={editTitle}
          entries={entries}
          importing={importing}
          onArtistChange={setEditArtist}
          onEdit={openEditModal}
          onFolderChange={setEditFolder}
          onRemove={handleRemove}
          onSave={saveEdit}
          onTitleChange={setEditTitle}
        />
      )}
    </div>
  )
}

export default MusicImportView
