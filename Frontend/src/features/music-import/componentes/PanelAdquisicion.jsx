const ESTADOS_TERMINALES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

function EstadoAdquisicion({ job }) {
  if (!job) return null

  const completed = job.progress?.completed ?? 0
  const total = job.progress?.total ?? 0
  const prepared = job.results?.filter((item) => item.status === 'staged').length ?? 0

  return (
    <div className={`mi-acquisition-job mi-acquisition-job--${job.status}`}>
      <div className="mi-acquisition-job__summary">
        <strong>{job.status}</strong>
        <span>{completed} de {total} enlaces</span>
        <span>{prepared} MP3 preparados</span>
      </div>
      <progress value={completed} max={total || 1} />
      {job.currentUrl && <div className="mi-acquisition-job__current" title={job.currentUrl}>{job.currentUrl}</div>}
      {job.errors?.length > 0 && (
        <ul className="mi-acquisition-job__errors">
          {job.errors.map((item) => (
            <li key={`${item.url || 'error'}-${item.file || ''}-${item.message}`}>{item.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PanelAdquisicion({
  acquisitionJob,
  cancellingAcquisition,
  onCancel,
  onPrepare,
  onRightsChange,
  onUrlsChange,
  rightsConfirmed,
  sourceUrls,
  startingAcquisition,
}) {
  const jobIsActive = acquisitionJob && !ESTADOS_TERMINALES.has(acquisitionJob.status)

  return (
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
        onChange={(event) => onUrlsChange(event.target.value)}
        placeholder={'https://music.youtube.com/playlist?list=…\nhttps://youtu.be/…'}
        rows={4}
        disabled={startingAcquisition || jobIsActive}
        aria-label="Enlaces autorizados"
      />
      <label className="mi-acquisition__rights">
        <input
          type="checkbox"
          checked={rightsConfirmed}
          onChange={(event) => onRightsChange(event.target.checked)}
          disabled={startingAcquisition}
        />
        Confirmo que el contenido es mío, libre o que tengo autorización para descargarlo.
      </label>
      <div className="mi-acquisition__actions">
        <button
          className="mi-btn mi-btn--primary"
          type="button"
          onClick={onPrepare}
          disabled={startingAcquisition || !rightsConfirmed || jobIsActive}
        >
          {startingAcquisition ? 'Enviando a n8n…' : 'Preparar desde enlaces'}
        </button>
        {jobIsActive && (
          <button className="mi-btn mi-btn--danger" type="button" onClick={onCancel} disabled={cancellingAcquisition}>
            {cancellingAcquisition ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
      <EstadoAdquisicion job={acquisitionJob} />
    </section>
  )
}
