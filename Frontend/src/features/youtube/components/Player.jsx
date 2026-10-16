// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/Player.jsx
// Barra de reproducción fija: canción actual, controles, progreso y volumen.
// Usa <audio> para descargas y YouTube IFrame Player para canciones en línea.
import { useState } from 'react';
import {
  PlayerPanelContent,
  VolumeControl,
} from '../../../components/reproductor/ControlesReproductor.jsx';

export function Player({ player }) {
  const {
    audioProps,
    iframeHostRef,
    currentSong,
    isPlaying,
    isBuffering,
    playerError,
    currentTime,
    progressMax,
    progressPct,
    volume,
    setVolume,
    togglePlay,
    playNext,
    playPrev,
    handleSeek,
    commitSeek,
  } = player;
  const [volumeExpanded, setVolumeExpanded] = useState(false);

  return (
    <>
      <audio {...audioProps} />
      <div ref={iframeHostRef} className="player-youtube-engine" aria-hidden="true" />
      {currentSong && (
        <footer className="player player-dock player--active player--shared">
          <div className="player-shared-scroller">
            <div className="player-dock__header">
              <strong>Reproduciendo ahora</strong>
            </div>
            <PlayerPanelContent
              artwork={currentSong.thumbnail}
              artist={currentSong.artist}
              currentTime={currentTime}
              duration={progressMax}
              error={playerError}
              hasAudio
              isBuffering={isBuffering}
              isPlaying={isPlaying}
              onNext={playNext}
              onPrevious={playPrev}
              onTogglePlayback={togglePlay}
              progress={(
                <input
                  type="range"
                  min="0"
                  max={progressMax || 0}
                  step="0.1"
                  value={Math.min(currentTime, progressMax || 0)}
                  onChange={handleSeek}
                  onMouseUp={commitSeek}
                  onTouchEnd={commitSeek}
                  onKeyUp={commitSeek}
                  disabled={!progressMax}
                  aria-label="Progreso"
                  className="player-shared-progress"
                  style={{ '--progress': `${progressPct}%` }}
                />
              )}
              title={currentSong.title}
            />
            <div className="player-dock__actions player-shared-actions">
              <span />
              <div className="player-dock__volume">
                <VolumeControl
                  expanded={volumeExpanded}
                  onExpandedChange={setVolumeExpanded}
                  onVolumeChange={(nextVolume) => setVolume(nextVolume / 100)}
                  volume={Math.round(volume * 100)}
                />
              </div>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
