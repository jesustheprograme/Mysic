// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/Player.jsx
// Barra de reproducción fija: canción actual, controles, progreso y volumen.
// Usa <audio> para descargas y YouTube IFrame Player para canciones en línea.
import { formatTime } from '../lib/format.js';
import { Cover } from './Cover.jsx';
import { MuteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, Spinner, VolumeIcon } from './icons.jsx';
import { useState } from 'react';

export function Player({ player, onOpenArtist, PlayerPanelComponent, VolumeControlComponent }) {
  const {
    audioProps,
    iframeHostRef,
    isLocal,
    currentSong,
    hasNext,
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

  if (currentSong && PlayerPanelComponent) {
    return (
      <>
        <audio {...audioProps} />
        <footer className="player player-dock player--active player--shared">
          <div ref={iframeHostRef} className="player-youtube-engine" aria-hidden="true" />
          <div className="player-shared-scroller">
            <div className="player-dock__header">
              <strong>Reproduciendo ahora</strong>
            </div>
            <PlayerPanelComponent
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
            {VolumeControlComponent && (
              <div className="player-dock__actions player-shared-actions">
                <span />
                <div className="player-dock__volume">
                  <VolumeControlComponent
                    expanded={volumeExpanded}
                    onExpandedChange={setVolumeExpanded}
                    onVolumeChange={(nextVolume) => setVolume(nextVolume / 100)}
                    volume={Math.round(volume * 100)}
                  />
                </div>
              </div>
            )}
          </div>
        </footer>
      </>
    );
  }

  return (
    <>
      <audio {...audioProps} />

      <footer className={`player${currentSong ? ' player--active' : ''}`}>
        <div className={`player-youtube${currentSong && !isLocal ? ' player-youtube--active' : ''}`}>
          {currentSong && <Cover className="player-artwork" src={currentSong.thumbnail} />}
          <div ref={iframeHostRef} className="player-youtube-engine" aria-hidden="true" />
        </div>
        <div className="player-track">
          {currentSong ? (
            <>
              <Cover className="player-cover" src={currentSong.thumbnail} />
              <div className="player-meta">
                <div className="player-title" title={currentSong.title}>
                  {currentSong.title}
                </div>
                <div className="player-artist" title={currentSong.artist}>
                  {currentSong.artistId ? (
                    <button className="link" onClick={() => onOpenArtist(currentSong.artistId)}>
                      {currentSong.artist}
                    </button>
                  ) : (
                    currentSong.artist
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="player-meta">
              <div className="player-title player-title--empty">Nada en reproducción</div>
            </div>
          )}
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button onClick={playPrev} disabled={!currentSong} aria-label="Anterior" className="ctrl">
              <PrevIcon />
            </button>
            <button
              onClick={togglePlay}
              disabled={!currentSong}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              className="ctrl ctrl--main"
            >
              {isBuffering ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={playNext} disabled={!currentSong || !hasNext} aria-label="Siguiente" className="ctrl">
              <NextIcon />
            </button>
          </div>
          <div className="player-progress">
            <span className="time">{formatTime(currentTime)}</span>
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
              disabled={!currentSong || !progressMax}
              aria-label="Progreso"
              className="progress"
              style={{ '--progress': `${progressPct}%` }}
            />
            <span className="time">{formatTime(progressMax)}</span>
          </div>
          {playerError && <div className="player-error">{playerError}</div>}
        </div>

        <div className="player-volume">
          <button
            onClick={() => setVolume((v) => (v === 0 ? 0.8 : 0))}
            aria-label={volume === 0 ? 'Activar sonido' : 'Silenciar'}
            className="ctrl"
          >
            {volume === 0 ? <MuteIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volumen"
            className="volume"
            style={{ '--progress': `${volume * 100}%` }}
          />
        </div>
      </footer>
    </>
  );
}
