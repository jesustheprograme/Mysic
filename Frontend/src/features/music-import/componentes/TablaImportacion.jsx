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

export default function TablaImportacion({
  analyzing,
  deletingRow,
  editingRow,
  editArtist,
  editFolder,
  editTitle,
  entries,
  importing,
  onArtistChange,
  onEdit,
  onFolderChange,
  onRemove,
  onSave,
  onTitleChange,
}) {
  return (
    <div className="mi-table-wrap">
      <table className="mi-table">
        <thead>
          <tr>
            <th>Archivo</th><th>Portada</th><th>Artista</th><th>Título</th><th>Álbum</th>
            <th>Año</th><th>Género</th><th>Pista</th><th>Confianza</th><th>Carpeta Cloudinary</th>
            <th>Destino servidor</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.file} className={`mi-row mi-row--${entry.status}`}>
              <td className="mi-file">{entry.file}</td>
              <td>{entry.embeddedCover ? '✓' : '—'}</td>
              <td>{editingRow === entry.file ? (
                <input className="mi-edit" value={editArtist} aria-label={`Artista de ${entry.file}`} onChange={(event) => onArtistChange(event.target.value)} placeholder="Artista" />
              ) : entry.metadata?.artist || '—'}</td>
              <td>{editingRow === entry.file ? (
                <input className="mi-edit" value={editTitle} aria-label={`Título de ${entry.file}`} onChange={(event) => onTitleChange(event.target.value)} placeholder="Título" />
              ) : entry.metadata?.title || '—'}</td>
              <td>{entry.metadata?.album || '—'}</td>
              <td>{entry.metadata?.year || '—'}</td>
              <td>{entry.metadata?.genres?.join(', ') || '—'}</td>
              <td>{entry.metadata?.trackNumber || '—'}</td>
              <td><ConfidenceBar confidence={entry.metadata?.confidence} /></td>
              <td>{editingRow === entry.file ? (
                <div className="mi-edit-row">
                  <input className="mi-edit" value={editFolder} aria-label={`Carpeta Cloudinary de ${entry.file}`} onChange={(event) => onFolderChange(event.target.value)} placeholder="artistas/album" />
                  <button className="mi-btn mi-btn--small" type="button" onClick={() => onSave(entry)}>Guardar</button>
                </div>
              ) : entry.cloudinaryFolder ? (
                <span className="mi-folder">{entry.cloudinaryFolder}</span>
              ) : <span className="mi-muted">Sin carpeta</span>}</td>
              <td>{entry.remoteDestination ? (
                <span className="mi-folder" title={entry.remoteDestination}>{entry.remoteDestination}</span>
              ) : <span className="mi-muted">Se calcula al analizar</span>}</td>
              <td><StatusBadge status={entry.status} /></td>
              <td>
                {entry.error && <span className="mi-error-text" title={entry.error}>{entry.error}</span>}
                {entry.status === 'error' && <button className="mi-btn mi-btn--small" type="button" onClick={() => onEdit(entry)}>Editar</button>}
                {entry.status === 'ready' && !entry.cloudinaryFolder && <button className="mi-btn mi-btn--small" type="button" onClick={() => onEdit(entry)}>Asignar</button>}
                {entry.cloudinaryFolder && entry.status === 'ready' && <button className="mi-btn mi-btn--small" type="button" onClick={() => onEdit(entry)}>Editar</button>}
                <button
                  className="mi-btn mi-btn--small mi-btn--danger"
                  type="button"
                  disabled={deletingRow === entry.file || analyzing || importing}
                  onClick={() => onRemove(entry)}
                >
                  {deletingRow === entry.file ? 'Eliminando…' : 'Eliminar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
