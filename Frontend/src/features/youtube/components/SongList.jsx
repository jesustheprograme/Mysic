// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/SongList.jsx
// Lista de canciones reproducible. Al pulsar una fila, la lista completa
// pasa a ser la cola (aunque solo se muestren las primeras con `limit`).
import { Cover } from './Cover.jsx';
import { DownloadButton } from './DownloadButton.jsx';
import { Equalizer, PauseIcon, PlayIcon } from './icons.jsx';

export function SongList({
  songs,
  limit,
  currentId,
  isPlaying,
  onPlay,
  onTogglePlay,
  onOpenArtist,
  onOpenAlbum,
  hideAlbum,
  showIndex,
  downloadedIds,
  jobs,
  onDownload,
  onDeleteDownload,
  online,
}) {
  if (!songs || songs.length === 0) return null;
  const visible = limit ? songs.slice(0, limit) : songs;
  const downloadProps = { downloadedIds, jobs, onDownload, onDeleteDownload, online };

  return (
    <ul className="song-list">
      {visible.map((song, index) => {
        const isCurrent = song.id === currentId;
        const activate = () => (isCurrent ? onTogglePlay() : onPlay(songs, index));
        return (
          <li
            key={`${song.id}-${index}`}
            className={`song${isCurrent ? ' song--current' : ''}`}
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') activate();
            }}
            role="button"
            tabIndex={0}
            aria-label={`${isCurrent && isPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
          >
            {showIndex && <span className="song-index">{song.index ?? index + 1}</span>}
            <div className="song-cover">
              <Cover className="cover-fill" src={song.thumbnail} lazy />
              <span className="song-cover-overlay">{isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}</span>
            </div>
            <div className="song-meta">
              <h4 className="song-title">{song.title}</h4>
              <p className="song-sub">
                {song.artistId ? (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist(song.artistId);
                    }}
                  >
                    {song.artist}
                  </button>
                ) : (
                  song.artist
                )}
                {!hideAlbum && (
                  <>
                    {' • '}
                    {song.albumId ? (
                      <button
                        className="link song-album"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAlbum(song.albumId);
                        }}
                      >
                        {song.album}
                      </button>
                    ) : (
                      <span className="song-album">{song.album}</span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="song-duration">{isCurrent && isPlaying ? <Equalizer /> : song.duration}</div>
            <DownloadButton song={song} {...downloadProps} />
          </li>
        );
      })}
    </ul>
  );
}
