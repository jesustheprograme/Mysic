import { ListMusic } from 'lucide-react'
import { useCallback, useState } from 'react'
import ControlledWaveform from '../reproductor/ControlledWaveform.jsx'
import PlayerDockMenu from '../reproductor/PlayerDockMenu.jsx'
import { useArtworkAccent } from '../../features/adaptive-theme/useArtworkAccent.js'
import useAmbientAccent from '../../features/adaptive-theme/useAmbientAccent.js'
import LyricsSection, { LyricsToggleButton } from '../../features/lyrics/LyricsSection.jsx'
import useTaskbarControls from '../../features/taskbar/useTaskbarControls.js'
import HeartToggle from '../HeartToggle.jsx'
import { sizedImage } from '../../lib/imageSize.js'
import {
  CompactNowPlaying,
  PlayerPanelContent,
  PlayerPanelToggleIcon,
  PlayerQueue,
  VolumeControl,
} from '../reproductor/ControlesReproductor.jsx'

// Reproductor del catálogo de YouTube Music: el audio lo gestiona usePlayer (externalPlayback) y
// este componente solo lo pinta.
// La carátula del panel mide como mucho 220 px (.player-dock__artwork): se pide a ese tamaño por la
// densidad de la pantalla (240 px a 1x, 544 px a 2x) en vez de 544 px siempre.
const DOCK_ARTWORK_PX = 220
const playerArtworkUrl = (url) => sizedImage(url, DOCK_ARTWORK_PX)

function ControlledPlayerDock({ collapsed = false, externalPlayback, liked = false, onAlbumSelect, onArtistSelect, onClose, onNext, onOpenMiniPlayer, onOpenNowPlaying, onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, queue, suppressed = false, track }) {
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
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
  // Botones de la miniatura de la barra de tareas (Windows): los maneja el reproductor que tiene el control.
  useTaskbarControls({
    active: !suppressed,
    canLike: Boolean(onToggleFavorite),
    hasTrack: Boolean(track?.id),
    isPlaying,
    liked,
    onNext,
    onPrevious,
    onToggleLike: onToggleFavorite,
    onTogglePlayback: togglePlayback,
  })
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
            <PlayerDockMenu onClose={onClose} onExpand={onOpenNowPlaying} />
          </div>
        </div>

        <PlayerPanelContent
          album={track.album ?? track.albumTitle}
          albumId={track.albumId}
          artwork={artwork}
          artist={track.artist}
          artistId={track.artistId}
          onAlbumSelect={onAlbumSelect}
          onArtistSelect={onArtistSelect}
          onArtworkClick={onOpenNowPlaying}
          linkByName
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
          <LyricsToggleButton open={lyricsOpen} onToggle={() => setLyricsOpen((open) => !open)} />
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
          open={lyricsOpen}
          onSeek={(time) => {
            const event = { target: { value: time } }
            handleSeek(event)
            commitSeek(event)
          }}
          track={track}
        />

        <PlayerQueue
          activeIndex={currentIndex}
          onAlbumSelect={onAlbumSelect}
          onArtistSelect={onArtistSelect}
          onQueueSelect={handleQueueSelect}
          queue={queue}
        />
      </div>
    </aside>
  )
}

export default ControlledPlayerDock
