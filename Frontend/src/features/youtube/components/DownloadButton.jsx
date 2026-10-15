// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/DownloadButton.jsx
// Botón de descarga por canción (descargar / anillo de progreso / descargada)
// y botón "Descargar todo" para álbumes y artistas.
import { CheckIcon, DownloadIcon } from './icons.jsx';

export function DownloadButton({ song, downloadedIds, jobs, onDownload, onDeleteDownload, online }) {
  const job = jobs?.[song.id];
  const isDownloaded = downloadedIds?.has(song.id);
  const stop = (e) => e.stopPropagation();

  if (isDownloaded) {
    return (
      <button
        className="dl dl--done"
        aria-label="Descargada. Pulsa para borrar la descarga"
        title="Descargada (pulsa para borrar)"
        onClick={(e) => {
          stop(e);
          onDeleteDownload(song.id);
        }}
      >
        <CheckIcon />
      </button>
    );
  }
  if (job?.status === 'downloading') {
    const pct = job.progress !== null && job.progress !== undefined ? Math.round(job.progress * 100) : null;
    return (
      <span className="dl dl--progress" title="Descargando" onClick={stop}>
        <span className="dl-ring" style={{ '--pct': `${pct ?? 0}%` }} />
        <span className="dl-pct">{pct ?? '…'}</span>
      </span>
    );
  }
  const failed = job?.status === 'error';
  return (
    <button
      className={`dl${failed ? ' dl--error' : ''}`}
      aria-label={failed ? `Error al descargar: ${job.error}. Reintentar` : 'Descargar para escuchar sin conexión'}
      title={failed ? `Error: ${job.error}. Pulsa para reintentar` : 'Descargar'}
      disabled={!online}
      onClick={(e) => {
        stop(e);
        onDownload(song);
      }}
    >
      <DownloadIcon />
    </button>
  );
}

export function DownloadAllButton({ songs, downloadedIds, onDownloadMany, online }) {
  const pending = songs.filter((s) => !downloadedIds?.has(s.id)).length;
  if (songs.length === 0) return null;
  return (
    <button className="download-all" onClick={() => onDownloadMany(songs)} disabled={!online || pending === 0}>
      {pending === 0 ? <CheckIcon /> : <DownloadIcon />}
      {pending === 0 ? 'Todo descargado' : `Descargar todo (${pending})`}
    </button>
  );
}
