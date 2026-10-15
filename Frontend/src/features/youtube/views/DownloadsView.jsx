// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/views/DownloadsView.jsx
// Canciones guardadas para escuchar sin conexión, con progreso de las que están bajando.
import { DownloadIcon, PlayIcon } from '../components/icons.jsx';
import { SongList } from '../components/SongList.jsx';
import { formatBytes } from '../lib/format.js';

export function DownloadsView({ downloads, songListProps }) {
  const { items, jobs } = downloads;
  const inProgress = Object.entries(jobs).filter(([, job]) => job.status !== 'done');
  const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);

  return (
    <section className="downloads-page">
      <header className="detail">
        <span className="downloads-page__icon"><DownloadIcon /></span>
        <div className="detail-meta">
          <p className="detail-kind">Sin conexión</p>
          <h2 className="detail-title">Descargas</h2>
          <p className="detail-sub">
            {items.length === 0
              ? 'Todavía no has descargado ninguna canción.'
              : `${items.length} canción${items.length === 1 ? '' : 'es'} • ${formatBytes(totalSize)} en disco`}
          </p>
          {items.length > 0 && (
            <button className="play-all" onClick={() => songListProps.onPlay(items, 0)}>
              <PlayIcon /> Reproducir todo
            </button>
          )}
        </div>
      </header>

      {inProgress.length > 0 && (
        <>
          <h3 className="section-title">En curso</h3>
          <ul className="jobs">
            {inProgress.map(([id, job]) => (
              <li key={id} className={`job job--${job.status}`}>
                <span className="job-id">{id}</span>
                {job.status === 'downloading' && (
                  <>
                    <span className="job-bar">
                      <span className="job-bar-fill" style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
                    </span>
                    <span className="job-pct">
                      {job.progress !== null && job.progress !== undefined ? `${Math.round(job.progress * 100)} %` : '…'}
                    </span>
                  </>
                )}
                {job.status === 'error' && <span className="job-error">Error: {job.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {items.length === 0 ? (
        <p className="message">
          Usa el icono <DownloadIcon /> junto a cualquier canción, o "Descargar todo" en un álbum, para guardarla y
          escucharla sin internet.
        </p>
      ) : (
        <SongList songs={items} {...songListProps} />
      )}
    </section>
  );
}
