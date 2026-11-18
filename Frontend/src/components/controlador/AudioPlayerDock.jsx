import { ListMusic } from 'lucide-react'
import PlayerDockMenu from '../reproductor/PlayerDockMenu.jsx'
import { useArtworkAccent } from '../../features/adaptive-theme/useArtworkAccent.js'
import useAmbientAccent from '../../features/adaptive-theme/useAmbientAccent.js'
import { useState } from 'react'
import LyricsSection, { LyricsToggleButton } from '../../features/lyrics/LyricsSection.jsx'
import useTaskbarControls from '../../features/taskbar/useTaskbarControls.js'
import HeartToggle from '../HeartToggle.jsx'
import {
  CompactNowPlaying,
  PlayerDiscoveryLoader,
  PlayerPanelContent,
  PlayerPanelToggleIcon,
  PlayerQueue,
  VolumeControl,
} from '../reproductor/ControlesReproductor.jsx'
import { formatTime } from '../reproductor/utilidadesReproductor.js'
import useAudioPlayerDock from './useAudioPlayerDock.js'

// Reproductor del catálogo propio de Mysic: el audio lo gestiona useAudioPlayerDock (WaveSurfer).
function AudioPlayerDock(props) {
  const {
    collapsed = false, isLoading = false, liked = false, onAlbumSelect, onArtistSelect, onClose, onNext, onOpenMiniPlayer,
    onPrevious, onQueueSelect, onToggleCollapsed, onToggleFavorite, queue, suppressed = false, track,
  } = props
  const player = useAudioPlayerDock(props)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  // Botones de la miniatura de la barra de tareas (Windows): los maneja el reproductor que tiene el control.
  useTaskbarControls({
    active: !suppressed,
    canLike: Boolean(onToggleFavorite),
    hasTrack: Boolean(track?.id) && !isLoading,
    isPlaying: player.isPlaying,
    liked,
    onNext,
    onPrevious,
    onToggleLike: onToggleFavorite,
    onTogglePlayback: player.togglePlayback,
  })
  const accent = useArtworkAccent(track.artwork)
  useAmbientAccent(accent)
  const dockStyle = accent ? { ...player.playerStyle, '--player-accent': accent } : player.playerStyle

  return (
    <aside
      className={`player-dock player-dock--animated${collapsed ? ' player-dock--collapsed' : ''}${player.trackChangeAnimationEnabled ? ' player-dock--track-changing' : ''}${suppressed ? ' player-dock--suppressed' : ''}`}
      aria-label={`Reproductor de ${track.title}`}
      aria-hidden={suppressed || undefined}
      inert={suppressed || undefined}
      style={dockStyle}
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
      {collapsed && !isLoading && (
        <div className="player-dock__compact">
          <CompactNowPlaying
            analyser={player.analyser}
            currentTime={player.currentTime}
            duration={player.duration}
            hasAudio={player.hasAudio}
            isPlaying={player.isPlaying}
            onExpand={onToggleCollapsed}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={player.togglePlayback}
            track={track}
          />
        </div>
      )}
      <div className="player-dock__scroller">
      <div className="player-dock__header">
        <strong>{isLoading ? 'Descubrimiento semanal' : 'Reproduciendo ahora'}</strong>
        <div className="player-dock__header-actions">
          <PlayerDockMenu onClose={onClose} />
        </div>
      </div>

      {isLoading ? (
        <PlayerDiscoveryLoader />
      ) : (
        <>
          <PlayerPanelContent
            album={track.album ?? track.albumTitle}
            albumId={track.albumId}
            artwork={track.artwork}
            artist={track.artist}
            artistId={track.artistId}
            onAlbumSelect={onAlbumSelect}
            onArtistSelect={onArtistSelect}
            currentTime={player.currentTime}
            duration={player.duration}
            hasAudio={player.hasAudio}
            isPlaying={player.isPlaying}
            onNext={onNext}
            onPrevious={onPrevious}
            onTogglePlayback={player.togglePlayback}
            progress={(
              <div
                className={`waveform-timeline__wave${player.hasAudio ? '' : ' waveform-timeline__wave--empty'}`}
                ref={player.waveformRef}
                role="slider"
                tabIndex={player.hasAudio ? 0 : -1}
                aria-label="Progreso de reproduccion"
                aria-valuemin="0"
                aria-valuemax={player.duration}
                aria-valuenow={player.currentTime}
                aria-valuetext={`${formatTime(player.currentTime)} de ${formatTime(player.duration)}`}
                onKeyDown={player.handleWaveformKeyDown}
              />
            )}
            title={track.title}
            trackAction={(
              <div
                className="player-dock__favorite-wrap"
                aria-label="Añadir a favoritos"
                title="Añadir a favoritos"
              >
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
            <button
              className="player-dock__action"
              type="button"
              aria-label="Abrir mini reproductor"
              title="Abrir mini reproductor"
              onClick={onOpenMiniPlayer}
            >
              <ListMusic size={17} aria-hidden="true" />
            </button>
            <LyricsToggleButton open={lyricsOpen} onToggle={() => setLyricsOpen((open) => !open)} />
            <div className="player-dock__volume">
              <VolumeControl
                expanded={player.volumeExpanded}
                onExpandedChange={player.setVolumeExpanded}
                onVolumeChange={player.changeVolume}
                volume={player.volume}
              />
            </div>
          </div>

          <LyricsSection
            currentTime={player.currentTime}
            duration={player.duration}
            onSeek={player.seekTo}
            open={lyricsOpen}
            track={track}
          />

          <PlayerQueue
            activeTrackId={track.id}
            onAlbumSelect={onAlbumSelect}
            onArtistSelect={onArtistSelect}
            onQueueSelect={onQueueSelect}
            queue={queue}
          />
        </>
      )}
      </div>
    </aside>
  )
}

export default AudioPlayerDock
