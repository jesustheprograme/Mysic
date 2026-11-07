import { ListMusic, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import ControlledWaveform from '../reproductor/ControlledWaveform.jsx'
import { useArtworkAccent } from '../../features/adaptive-theme/useArtworkAccent.js'
import useAmbientAccent from '../../features/adaptive-theme/useAmbientAccent.js'
import LyricsSection from '../../features/lyrics/LyricsSection.jsx'
import HeartToggle from '../HeartToggle.jsx'
import {
  CompactNowPlaying,
  PlayerPanelContent,
  PlayerPanelToggleIcon,
  PlayerQueue,
  VolumeControl,
} from '../reproductor/ControlesReproductor.jsx'

// Reproductor del catálogo de YouTube Music: el audio lo gestiona usePlayer (externalPlayback) y
// este componente solo lo pinta.
function playerArtworkUrl(url) {
  if (!url?.includes('yt3.googleusercontent.com')) return url
  return url.replace(/=w\d+-h\d+-/, '=w544-h544-')
}

function ControlledPlayerDock({ collapsed = false, externalPlayback, liked = false, onClose, onNext, onOpenMiniPlayer, onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, queue, suppressed = false, track }) {
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  // Referencia estable: con una función nueva en cada tick, `memo` de PlayerQueue no serviría.
  const handleQueueSelect = useCallback((_item, index) => onQueueSelect(index), [onQueueSelect])
  const {
    analyser,
    commitSeek,
    currentIndex,
    currentTime,
    duration,
    error,
    handleSeek,
    isBuffering,
    isPlaying,
    setVolume,
    togglePlayback,
    volume,
  } = externalPlayback
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0
  const artwork = playerArtworkUrl(track.artwork)
  const displayedTrack = artwork === track.artwork ? track : { ...track, artwork }
  const accent = useArtworkAccent(artwork)
  useAmbientAccent(accent)
  const playerStyle = {
    '--mobile-player-progress': `${progress}%`,
    ...(accent ? { '--player-accent': accent } : {}),
    ...(collapsed && artwork ? { '--compact-artwork': `url(${artwork})` } : {}),
  }

  return (
    <aside
      className={`player-dock player-dock--animated${collapsed ? ' player-dock--collapsed' : ''}${suppressed ? ' player-dock--suppressed' : ''}`}
      aria-label={`Reproductor de ${track.title}`}
      aria-hidden={suppressed || undefined}
      inert={suppressed || undefined}
      style={playerStyle}
    >
      <span className="player-dock__reveal-zone" aria-hidden="true" />
      <button
        className="player-dock__collapse"
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Desplegar reproductor' : 'Contraer reproductor'}
        title={collapsed ? 'Desplegar reproductor' : 'Contraer reproductor'}
        onClick={onToggleCollapsed}
      >
        <PlayerPanelToggleIcon collapsed={collapsed} />
      </button>
      {collapsed && (
        <div className="player-dock__compact">
          <CompactNowPlaying
            analyser={analyser}
            currentTime={currentTime}
            duration={duration}
            hasAudio
            isPlaying={isPlaying}
            onExpand={onToggleCollapsed}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={togglePlayback}
            track={displayedTrack}
          />
        </div>
      )}
      <div className="player-dock__scroller">
        <div className="player-dock__header">
          <strong>Reproduciendo ahora</strong>
          <div className="player-dock__header-actions">
            <button className="player-dock__close" type="button" aria-label="Cerrar reproductor" title="Cerrar reproductor" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <PlayerPanelContent
          artwork={artwork}
          artist={track.artist}
          currentTime={currentTime}
          duration={duration}
          error={error}
          hasAudio
          isBuffering={isBuffering}
          isPlaying={isPlaying}
          onNext={onNext}
          onPrevious={onPrevious}
          onTogglePlayback={togglePlayback}
          progress={(
            <ControlledWaveform trackId={track.id} currentTime={currentTime} duration={duration}
              onSeek={(time) => {
                const event = { target: { value: time } }
                handleSeek(event)
                commitSeek(event)
              }} />
          )}
          title={track.title}
          trackAction={(
            <div className="player-dock__favorite-wrap">
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
          )}
        />

        <div className="player-dock__actions">
          <button className="player-dock__action" type="button"
            aria-label="Abrir mini reproductor" title="Abrir mini reproductor" onClick={onOpenMiniPlayer}>
            <ListMusic size={17} aria-hidden="true" />
          </button>
          <div className="player-dock__volume">
            <VolumeControl
              expanded={volumeExpanded}
              onExpandedChange={setVolumeExpanded}
              onVolumeChange={(nextVolume) => setVolume(nextVolume / 100)}
              volume={Math.round(volume * 100)}
            />
          </div>
        </div>

        <LyricsSection
          currentTime={currentTime}
          duration={duration}
          onSeek={(time) => {
            const event = { target: { value: time } }
            handleSeek(event)
            commitSeek(event)
          }}
          track={track}
        />

        <PlayerQueue
          activeIndex={currentIndex}
          onQueueSelect={handleQueueSelect}
          queue={queue}
        />
      </div>
    </aside>
  )
}

export default ControlledPlayerDock
