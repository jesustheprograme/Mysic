import { LoaderCircle, MoreVertical, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import VerticalSpectrum from '../VerticalSpectrum.jsx'
import { formatTime } from './utilidadesReproductor.js'

export function PlayerPanelContent({ artwork, artist, currentTime, duration, error, hasAudio, isBuffering = false, isPlaying, onNext, onPrevious, onTogglePlayback, progress, title, trackAction = null }) {
  return (
    <>
      <div className={`player-dock__track${trackAction ? '' : ' player-dock__track--without-action'}`}>
        <div className="player-dock__artwork">
          <span
            className="player-dock__artwork-backdrop"
            style={{ backgroundImage: artwork ? `url(${artwork})` : undefined }}
            aria-hidden="true"
          />
          {artwork && <img src={artwork} alt="" />}
        </div>
        <div className="player-dock__details">
          <strong>{title}</strong>
          <span>{artist}</span>
        </div>
        {trackAction}
      </div>

      <div className="player-dock__center">
        <div className="player-dock__transport">
          <button type="button" aria-label="Anterior" title="Anterior" onClick={onPrevious}>
            <SkipBack size={19} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            className="player-dock__play"
            type="button"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            title={hasAudio ? (isPlaying ? 'Pausar' : 'Reproducir') : 'Audio no disponible'}
            disabled={!hasAudio}
            onClick={onTogglePlayback}
          >
            {isBuffering ? (
              <LoaderCircle className="player-dock__buffering" size={19} aria-hidden="true" />
            ) : isPlaying ? (
              <Pause size={19} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={19} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button type="button" aria-label="Siguiente" title="Siguiente" onClick={onNext}>
            <SkipForward size={19} fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <div className="waveform-timeline">
          <span>{formatTime(currentTime)}</span>
          {progress}
          <span>{formatTime(duration)}</span>
        </div>
        {error && <p className="player-dock__error" role="status">{error}</p>}
      </div>
    </>
  )
}

export function PlayerQueue({ activeIndex = null, activeTrackId = null, onQueueSelect, queue }) {
  return (
    <section className="player-dock__queue" aria-labelledby="player-queue-title">
      <div className="player-dock__tabs" role="tablist" aria-label="Contenido del reproductor">
        <button className="player-dock__tab player-dock__tab--active" type="button" role="tab" aria-selected="true">
          Cola
        </button>
        <button className="player-dock__tab" type="button" role="tab" aria-selected="false">
          Artistas
        </button>
        <button className="player-dock__tab" type="button" role="tab" aria-selected="false">
          Favoritos
        </button>
      </div>
      <h2 id="player-queue-title" className="sr-only">Cola de reproducción</h2>
      <div className="player-dock__queue-list">
        {queue.map((item, index) => {
          const isActive = activeIndex === index || (activeIndex === null && item.id === activeTrackId)

          return (
            <button
              className={`player-dock__queue-item${isActive ? ' player-dock__queue-item--active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => onQueueSelect(item, index)}
            >
              <img src={item.artwork} alt="" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.artist}</small>
              </span>
              <time>{formatTime(item.durationSeconds)}</time>
              <MoreVertical size={16} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <button className="player-dock__clear" type="button">
        Limpiar cola
      </button>
    </section>
  )
}

export function PlayerPanelToggleIcon({ collapsed }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d={collapsed
          ? 'M11.28 9.53L8.81 12l2.47 2.47a.749.749 0 0 1-.326 1.275.75.75 0 0 1-.734-.215l-3-3a.75.75 0 0 1 0-1.06l3-3a.749.749 0 0 1 1.275.326.75.75 0 0 1-.215.734'
          : 'M7.22 14.47L9.69 12 7.22 9.53a.749.749 0 0 1 .326-1.275.75.75 0 0 1 .734.215l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.042-.018.75.75 0 0 1-.018-1.042'}
      />
      <path
        fill="currentColor"
        d="M3.75 2h16.5c.966 0 1.75.784 1.75 1.75v16.5A1.75 1.75 0 0 1 20.25 22H3.75A1.75 1.75 0 0 1 2 20.25V3.75C2 2.784 2.784 2 3.75 2M3.5 3.75v16.5c0 .138.112.25.25.25H15v-17H3.75a.25.25 0 0 0-.25.25m13 16.75h3.75a.25.25 0 0 0 .25-.25V3.75a.25.25 0 0 0-.25-.25H16.5Z"
      />
    </svg>
  )
}

export function VolumeControl({ expanded, onExpandedChange, onVolumeChange, volume }) {
  const Icon = volume === 0 ? VolumeX : Volume2
  const closeTimerRef = useRef(null)
  const [hoverOpen, setHoverOpen] = useState(false)
  const open = expanded || hoverOpen

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  function openFromPointer() {
    clearTimeout(closeTimerRef.current)
    setHoverOpen(true)
  }

  function closeFromPointer() {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setHoverOpen(false), 320)
  }

  return (
    <div
      className={`volume-control${open ? ' volume-control--open' : ''}${expanded ? ' volume-control--pinned' : ''}`}
      onPointerEnter={openFromPointer}
      onPointerLeave={closeFromPointer}
    >
      <input
        className="volume-control__level"
        type="range"
        min="0"
        max="100"
        value={volume}
        aria-label="Volumen"
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        style={{ '--volume-level': `${volume}%` }}
      />
      <button
        className="volume-control__button"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Cerrar control de volumen' : 'Mantener control de volumen abierto'}
        title={expanded ? 'Cerrar control de volumen' : 'Mantener control de volumen abierto'}
        onClick={() => onExpandedChange(!expanded)}
      >
        <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  )
}

export function CompactTrackTicker({ artist, onExpand, title }) {
  const viewportRef = useRef(null)
  const textRef = useRef(null)
  const [overflow, setOverflow] = useState(0)
  const text = [title, artist].filter(Boolean).join(' — ')

  useEffect(() => {
    const viewport = viewportRef.current
    const tickerText = textRef.current
    if (!viewport || !tickerText) return undefined

    function measureOverflow() {
      setOverflow(Math.max(0, tickerText.scrollHeight - viewport.clientHeight))
    }

    measureOverflow()
    const resizeObserver = new ResizeObserver(measureOverflow)
    resizeObserver.observe(viewport)
    resizeObserver.observe(tickerText)
    return () => resizeObserver.disconnect()
  }, [])

  const isOverflowing = overflow > 2
  const duration = Math.max(7, overflow / 14 + 4)

  return (
    <button
      className={`player-dock__compact-ticker${isOverflowing ? ' player-dock__compact-ticker--scrolling' : ''}`}
      type="button"
      ref={viewportRef}
      aria-label={`Desplegar reproductor: ${text}`}
      title="Desplegar reproductor"
      onClick={onExpand}
      style={{
        '--ticker-distance': `${overflow}px`,
        '--ticker-duration': `${duration}s`,
      }}
    >
      <span ref={textRef} aria-hidden="true">
        <span className="player-dock__compact-title">{title}</span>
        {artist && <span> — {artist}</span>}
      </span>
    </button>
  )
}

export function CompactPlaybackTime({ currentTime, duration }) {
  const label = `${formatTime(currentTime)} / ${formatTime(duration)}`

  return <div className="player-dock__compact-time" aria-label={`Progreso: ${label}`}>{label}</div>
}

export function CompactNowPlaying({ analyser, currentTime, duration, hasAudio, isPlaying, onExpand, onNext, onPrevious, onTogglePlayback, track }) {
  return (
    <div className="player-dock__compact-now-playing">
      <img className="player-dock__compact-now-playing-artwork" src={track.artwork} alt="" />
      <CompactTransport
        hasAudio={hasAudio}
        isPlaying={isPlaying}
        onNext={onNext}
        onPrevious={onPrevious}
        onTogglePlayback={onTogglePlayback}
      />
      <div className="player-dock__compact-visuals spectrum-zone">
        <CompactPlaybackTime currentTime={currentTime} duration={duration} />
        <CompactTrackTicker key={track.id} artist={track.artist} onExpand={onExpand} title={track.title} />
        <div className="player-dock__compact-spectrum">
          <VerticalSpectrum analyser={analyser} playing={isPlaying} width={28} span={0.86} />
        </div>
      </div>
    </div>
  )
}

export function CompactTransport({ hasAudio, isPlaying, onNext, onPrevious, onTogglePlayback }) {
  return (
    <div className="player-dock__compact-transport" aria-label="Controles de reproducción">
      <button type="button" aria-label="Anterior" title="Anterior" onClick={onPrevious}>
        <SkipBack size={13} fill="currentColor" aria-hidden="true" />
      </button>
      <button
        className="player-dock__compact-play"
        type="button"
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        title={hasAudio ? (isPlaying ? 'Pausar' : 'Reproducir') : 'Audio no disponible'}
        disabled={!hasAudio}
        onClick={onTogglePlayback}
      >
        {isPlaying
          ? <Pause size={13} fill="currentColor" aria-hidden="true" />
          : <Play size={13} fill="currentColor" aria-hidden="true" />}
      </button>
      <button type="button" aria-label="Siguiente" title="Siguiente" onClick={onNext}>
        <SkipForward size={13} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  )
}

export function PlayerDiscoveryLoader() {
  return (
    <div className="player-discovery-loader" role="status" aria-live="polite">
      <p>Preparando tu descubrimiento</p>
      <div className="player-discovery-loader__spinner-container" aria-hidden="true">
        <div className="player-discovery-loader__spinner" />
      </div>
      <span>Estamos mezclando canciones para ti</span>
    </div>
  )
}
