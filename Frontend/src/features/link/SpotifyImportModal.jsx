import { Check, CircleAlert, Copy, ListMusic, LoaderCircle, Music2, Play, X } from 'lucide-react'
import { useEffect } from 'react'
import { sizedImage } from '../../lib/imageSize.js'
import { api } from '../youtube/lib/api.js'
import { showToast } from '../youtube/toast.js'
import { missingText, percentOf, spotifyImport, useSpotifyImport } from './spotifyImportStore.js'
import './spotify-import.css'

// Búsqueda de una canción en YouTube Music (la misma de todo Mysic: pasa por la caché del servidor).
const searchSongs = (query) => api.search(query, 'song').then((result) => result.items ?? [])

const plural = (count, one, many) => `${count.toLocaleString('es-ES')} ${count === 1 ? one : many}`

function Cover({ src, size = 100 }) {
  return src
    ? <img className="si__cover" src={sizedImage(src, size)} alt="" width={size} height={size} decoding="async" />
    : <span className="si__cover si__cover--empty" aria-hidden="true"><Music2 size={28} /></span>
}

function TierIcon({ tier }) {
  if (tier === 'matched') return <Check className="si__tier si__tier--ok" size={16} aria-label="Encontrada" />
  if (tier === 'check') return <CircleAlert className="si__tier si__tier--check" size={16} aria-label="Por revisar" />
  return <X className="si__tier si__tier--missing" size={16} aria-label="No encontrada" />
}

function Stats({ state }) {
  return (
    <ul className="si__stats">
      <li><Check size={15} aria-hidden="true" />{plural(state.matched, 'encontrada', 'encontradas')}</li>
      <li><CircleAlert size={15} aria-hidden="true" />{state.check} por revisar</li>
      <li><X size={15} aria-hidden="true" />{plural(state.missing, 'no se encontró', 'no se encontraron')}</li>
    </ul>
  )
}

function Preview({ state }) {
  return (
    <>
      <div className="si__card">
        <Cover src={state.cover} />
        <div className="si__card-copy">
          <strong>{state.name}</strong>
          {state.owner && <span>de {state.owner}</span>}
          <span>{plural(state.total, 'canción', 'canciones')}</span>
        </div>
      </div>
      {state.truncated && <p className="si__note">Spotify solo deja leer las primeras 100 canciones de una lista compartida; puede que haya más.</p>}
      <div className="si__actions">
        <button className="si__button" type="button" onClick={() => spotifyImport.close()}>Atrás</button>
        <button className="si__button si__button--primary" type="button" onClick={() => spotifyImport.start({ search: searchSongs })}>
          Encontrar {plural(state.total, 'canción', 'canciones')}
        </button>
      </div>
    </>
  )
}

function Matching({ state }) {
  const percent = percentOf(state)
  const saving = state.phase === 'saving'
  return (
    <>
      <p className="si__count">{saving ? <LoaderCircle className="si__spin" size={26} aria-hidden="true" /> : `${state.done} de ${state.total}`}</p>
      <div className="si__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={saving ? 100 : percent} aria-label="Progreso de la importación">
        <i style={{ width: `${saving ? 100 : percent}%` }} />
      </div>
      <Stats state={state} />
      {state.recent.length > 0 && (
        <ul className="si__recent" aria-label="Últimas canciones">
          {state.recent.map((row, index) => (
            <li key={`${row.title}-${index}`}>
              {row.thumbnail ? <img src={sizedImage(row.thumbnail, 40)} alt="" width="40" height="40" decoding="async" /> : <span className="si__thumb-empty" aria-hidden="true" />}
              <span className="si__recent-copy"><strong>{row.title}</strong><small>{row.artists}</small></span>
              <TierIcon tier={row.tier} />
            </li>
          ))}
        </ul>
      )}
      <p className="si__note">Busca varias canciones a la vez para ir rápido. Puedes cerrar esta ventana: el proceso continúa y la barra lateral muestra cuánto lleva.</p>
      {!saving && (
        <div className="si__actions">
          <button className="si__button" type="button" onClick={() => spotifyImport.stop()}>Parar</button>
          <button className="si__button si__button--primary" type="button" onClick={() => spotifyImport.close()}>Seguir explorando</button>
        </div>
      )}
    </>
  )
}

function Result({ state }) {
  const saved = state.saved
  const copyMissing = async () => {
    try {
      await navigator.clipboard.writeText(missingText(state))
      showToast(`Se copiaron ${plural(state.missing, 'canción', 'canciones')}`)
    } catch {
      showToast('No se pudo copiar')
    }
  }
  return (
    <>
      {saved && (
        <div className="si__card">
          <Cover src={state.cover} />
          <div className="si__card-copy">
            <strong>{state.name}</strong>
            <span>{plural(saved.count, 'canción guardada', 'canciones guardadas')} · {saved.updated ? 'actualizada' : 'creada'}</span>
            <span>en tus playlists</span>
          </div>
        </div>
      )}
      {state.message && <p className={`si__note${state.phase === 'done' ? '' : ' si__note--strong'}`}>{state.message}</p>}
      {saved?.trimmed > 0 && (
        <p className="si__note si__note--warn">El servidor solo aceptó las primeras {saved.count} de {saved.count + saved.trimmed} canciones. Se guardará la lista completa cuando se actualice el servidor de Mysic.</p>
      )}
      {state.phase !== 'failed' && <Stats state={state} />}
      {state.checkList.length > 0 && (
        <details className="si__details">
          <summary>Por revisar ({state.checkList.length})</summary>
          <ul>{state.checkList.map((row, index) => <li key={`${row.title}-${index}`}><strong>{row.title}</strong> <small>{row.artists}</small><em>→ {row.found}</em></li>)}</ul>
        </details>
      )}
      {state.missingList.length > 0 && (
        <details className="si__details">
          <summary>No están en YouTube Music ({state.missingList.length})</summary>
          <ul>{state.missingList.map((row, index) => <li key={`${row.title}-${index}`}><strong>{row.title}</strong> <small>{row.artists}</small></li>)}</ul>
        </details>
      )}
      <div className="si__actions">
        {state.missingList.length > 0 && <button className="si__button" type="button" onClick={copyMissing}><Copy size={15} aria-hidden="true" />Copiar no encontradas</button>}
        {state.found > 0 && saved && <button className="si__button" type="button" onClick={() => spotifyImport.playSongs()}><Play size={15} aria-hidden="true" />Reproducir</button>}
        <button className="si__button si__button--primary" type="button" onClick={() => spotifyImport.close()}>Cerrar</button>
      </div>
    </>
  )
}

const TITLES = {
  cancelled: 'Importación detenida',
  done: 'Todo listo',
  failed: 'La importación se detuvo',
  matching: 'Encontrando tus canciones',
  preview: 'Importar de Spotify',
  saving: 'Guardando tu playlist',
}

/**
 * Importar una playlist de Spotify (como limusic): vista previa, progreso y resultado en un cuadro, sin abrir ninguna
 * página. Cerrarlo no detiene la importación; la barra lateral enseña cuánto lleva (ver `importPill`).
 */
export default function SpotifyImportModal() {
  const state = useSpotifyImport()
  const visible = state.open && state.phase !== 'idle'

  useEffect(() => {
    if (!visible) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') spotifyImport.close() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible])

  if (!visible) return null
  const running = state.phase === 'matching' || state.phase === 'saving'
  return (
    <div className="si__backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) spotifyImport.close() }}>
      <section className="si" role="dialog" aria-modal="true" aria-labelledby="si-title">
        <header className="si__head">
          <ListMusic size={20} aria-hidden="true" />
          <h2 id="si-title">{TITLES[state.phase]}</h2>
          {state.phase === 'preview' && <span className="si__badge" title="Nuevo y se sigue afinando: revisa las canciones dudosas">Experimental</span>}
          <button className="si__close" type="button" aria-label={running ? 'Cerrar y seguir en segundo plano' : 'Cerrar'} onClick={() => spotifyImport.close()}><X size={17} aria-hidden="true" /></button>
        </header>
        {state.phase === 'preview' && <Preview state={state} />}
        {running && <Matching state={state} />}
        {(state.phase === 'done' || state.phase === 'failed' || state.phase === 'cancelled') && <Result state={state} />}
      </section>
    </div>
  )
}
