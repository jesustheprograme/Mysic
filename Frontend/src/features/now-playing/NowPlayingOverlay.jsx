import { ChevronDown, ListMusic, LoaderCircle, MessageSquareText, MicVocal, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ArtworkImage from '../../components/ArtworkImage.jsx'
import HeartToggle from '../../components/HeartToggle.jsx'
import ControlledWaveform from '../../components/reproductor/ControlledWaveform.jsx'
import { PlayerQueue, VolumeControl } from '../../components/reproductor/ControlesReproductor.jsx'
import { formatTime, isRealAlbum, UNKNOWN_ARTIST } from '../../components/reproductor/utilidadesReproductor.js'
import { sizedImage } from '../../lib/imageSize.js'
import CommentsPanel from '../comments/CommentsPanel.jsx'
import LyricsSection from '../lyrics/LyricsSection.jsx'
import './now-playing.css'

// "Reproduciendo ahora" a pantalla completa (se abre al pulsar la portada del controlador): portada y datos a la
// izquierda, letra o comentarios en el centro, la cola a la derecha y los controles abajo. Se cierra con la flecha,
// con Esc o al navegar a otra sección. Solo pinta: el audio sigue en usePlayer.

// Qué se ve, desde los botones junto al volumen (como Limusic, sin pestañas): en el centro la letra, los comentarios o
// nada (`panel`), y la cola a la derecha. Cada apertura empieza como Limusic: solo la portada grande, centrada.
const INITIAL_LAYOUT = { panel: null, queue: false }
// "A continuación" aparece en los últimos segundos de la canción.
const NEXT_UP_SECONDS = 20

const CENTER_TOGGLES = [
  { id: 'lyrics', label: 'la letra', icon: MicVocal },
  { id: 'comments', label: 'los comentarios', icon: MessageSquareText },
]

export default function NowPlayingOverlay({
  currentIndex, currentTime, duration, isBuffering, isPlaying, liked, onAlbumSelect, onArtistSelect, onClose, onNext,
  onPrevious, onQueueSelect, onSeek, onToggleFavorite, onTogglePlayback, onVolumeChange, queue, track, volume,
}) {
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const [layout, setLayout] = useState(INITIAL_LAYOUT)
  const updateLayout = (change) => setLayout((current) => ({ ...current, ...change(current) }))
  // PlayerQueue llama con (canción, posición); el reproductor espera la posición.
  const selectFromQueue = useCallback((_item, index) => onQueueSelect(index), [onQueueSelect])
  // Letra y comentarios comparten el centro: pulsar el que se ve lo oculta; pulsar el otro lo sustituye.
  const toggleCenter = (id) => updateLayout((current) => ({ panel: current.panel === id ? null : id }))
  const toggleQueue = () => updateLayout((current) => ({ queue: !current.queue }))
  const panel = layout.panel
  // Se pinta en <body>: no hereda --content-top del contenedor de la app. Se lee al abrir para no tapar la barra de
  // título de la ventana (minimizar, cerrar).
  const [top] = useState(() => {
    const value = document.querySelector('.music-app')?.style.getPropertyValue('--content-top')
    return value?.trim() || '36px'
  })

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!track) return null
  const artwork = sizedImage(track.artwork, 640)
  const album = track.album ?? track.albumTitle
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1
  const nextSong = nextIndex > 0 ? queue[nextIndex] : null
  // Con la cola a la vista la siguiente ya se ve en ella (y la tarjeta taparía sus últimas filas).
  const showNext = !layout.queue && Boolean(nextSong) && duration > 0 && duration - currentTime <= NEXT_UP_SECONDS

  return createPortal(
    <div className={`now-playing${panel ? '' : ' now-playing--no-panel'}${layout.queue ? '' : ' now-playing--no-queue'}`} role="dialog" aria-modal="true" aria-label={`Reproduciendo ahora: ${track.title}`} style={{ '--content-top': top }}>
      {artwork && <div className="now-playing__backdrop" style={{ backgroundImage: `url(${artwork})` }} aria-hidden="true" />}
      <span className="now-playing__eyebrow" aria-hidden="true">Reproduciendo ahora</span>
      {showNext && (
        <button className="now-playing__next" type="button" title={`Reproducir ahora: ${nextSong.title}`} onClick={() => onQueueSelect(nextIndex)}>
          {nextSong.artwork ? <img src={sizedImage(nextSong.artwork, 56)} alt="" width="56" height="56" decoding="async" /> : <span className="now-playing__next-art" aria-hidden="true" />}
          <span className="now-playing__next-copy">
            <small>A continuación</small>
            <strong>{nextSong.title}</strong>
            <span>{nextSong.artist}</span>
          </span>
        </button>
      )}
      <button className="now-playing__close" type="button" aria-label="Cerrar reproducción a pantalla completa" title="Cerrar (Esc)" onClick={onClose}>
        <ChevronDown size={22} aria-hidden="true" />
      </button>

      <section className="now-playing__info">
        <div className="now-playing__art"><ArtworkImage url={track.artwork} size={640} /></div>
        <div className="now-playing__titles">
          <h2>{track.title}</h2>
          <p>
            {/* Enlaces también sin id: se busca por nombre (ver handleDockArtist/handleDockAlbum en YoutubeView). */}
            {onArtistSelect && track.artist && track.artist !== UNKNOWN_ARTIST
              ? <button type="button" title={`Abrir artista ${track.artist}`} onClick={() => { onClose(); onArtistSelect(track.artistId, track.artist) }}>{track.artist}</button>
              : <span>{track.artist}</span>}
            {isRealAlbum(album, track.albumId) && (
              <>
                <i aria-hidden="true">·</i>
                {onAlbumSelect
                  ? <button type="button" title={`Abrir álbum ${album}`} onClick={() => { onClose(); onAlbumSelect(track.albumId, album, track.artist) }}>{album}</button>
                  : <span>{album}</span>}
              </>
            )}
          </p>
        </div>
      </section>

      {panel && (
        <section className="now-playing__center" aria-label={panel === 'lyrics' ? 'Letra' : 'Comentarios'}>
          <div className="now-playing__panel">
            {panel === 'lyrics'
              ? <LyricsSection currentTime={currentTime} duration={duration} onSeek={onSeek} open track={track} />
              : <CommentsPanel videoId={track.id} />}
          </div>
        </section>
      )}

      {layout.queue && (
        <aside className="now-playing__queue">
          <PlayerQueue activeIndex={currentIndex} onAlbumSelect={onAlbumSelect} onArtistSelect={onArtistSelect} onQueueSelect={selectFromQueue} queue={queue} />
        </aside>
      )}

      <footer className="now-playing__controls">
        <div className="waveform-timeline now-playing__timeline">
          <span>{formatTime(currentTime)}</span>
          <ControlledWaveform trackId={track.id} currentTime={currentTime} duration={duration} onSeek={onSeek} />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="now-playing__bar">
          <div className="now-playing__bar-side">
            <HeartToggle
              key={track.id}
              className="heart-container--player"
              portalCelebration
              label={`Me gusta ${track.title}`}
              liked={liked}
              onToggle={onToggleFavorite}
              removeLabel={`Quitar ${track.title} de favoritas`}
            />
          </div>
          <div className="now-playing__transport">
            <button type="button" aria-label="Anterior" title="Anterior" onClick={onPrevious}><SkipBack size={22} fill="currentColor" aria-hidden="true" /></button>
            <button className="now-playing__play" type="button" aria-label={isPlaying ? 'Pausar' : 'Reproducir'} onClick={onTogglePlayback}>
              {isBuffering
                ? <LoaderCircle className="player-dock__buffering" size={24} aria-hidden="true" />
                : isPlaying ? <Pause size={24} fill="currentColor" aria-hidden="true" /> : <Play size={24} fill="currentColor" aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Siguiente" title="Siguiente" onClick={onNext}><SkipForward size={22} fill="currentColor" aria-hidden="true" /></button>
          </div>
          <div className="now-playing__bar-side now-playing__bar-side--end">
            <div className="now-playing__view-toggles" role="group" aria-label="Qué mostrar">
              {CENTER_TOGGLES.map(({ id, label, icon: Icon }) => (
                <button
                  className={panel === id ? 'now-playing__view-toggle now-playing__view-toggle--on' : 'now-playing__view-toggle'}
                  type="button"
                  aria-pressed={panel === id}
                  aria-label={panel === id ? `Ocultar ${label}` : `Mostrar ${label}`}
                  title={panel === id ? `Ocultar ${label}` : `Mostrar ${label}`}
                  key={id}
                  onClick={() => toggleCenter(id)}
                >
                  <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                </button>
              ))}
              <button
                className={layout.queue ? 'now-playing__view-toggle now-playing__view-toggle--on' : 'now-playing__view-toggle'}
                type="button"
                aria-pressed={layout.queue}
                aria-label={layout.queue ? 'Ocultar la cola' : 'Mostrar la cola'}
                title={layout.queue ? 'Ocultar la cola' : 'Mostrar la cola'}
                onClick={toggleQueue}
              >
                <ListMusic size={20} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
            <VolumeControl expanded={volumeExpanded} onExpandedChange={setVolumeExpanded} onVolumeChange={onVolumeChange} volume={volume} />
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
