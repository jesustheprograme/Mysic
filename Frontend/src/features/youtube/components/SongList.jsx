// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/SongList.jsx
// Lista de canciones reproducible. Al pulsar una fila, la lista completa
// pasa a ser la cola (aunque solo se muestren las primeras con `limit`).
import { Cover } from './Cover.jsx';
import { DownloadButton } from './DownloadButton.jsx';
import { Equalizer, PauseIcon, PlayIcon } from './icons.jsx';
import { ListPlus } from 'lucide-react';

function asPlaylistSong(song) {
  return {
    ...song,
    artwork: song.thumbnail,
    source: 'youtube',
  };
}

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
  onAddToPlaylist,
}) {
  if (!songs || songs.length === 0) return null;
  const visible = limit ? songs.slice(0, limit) : songs;
  const downloadProps = { downloadedIds, jobs, onDownload, onDeleteDownload, online };

  return (
    <ol className="song-list">
      {visible.map((song, index) => {
        const isCurrent = song.id === currentId;
        const activate = () => (isCurrent ? onTogglePlay() : onPlay(songs, index));
        return (
          <li
            key={song.id}
            className={`song${isCurrent ? ' song--current' : ''}`}
          >
            {showIndex && <span className="song-index">{song.index ?? index + 1}</span>}
            <button
              className="song-cover"
              onClick={activate}
              aria-label={`${isCurrent && isPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
            >
              <Cover className="cover-fill" src={song.thumbnail} lazy />
              <span className="song-cover-overlay">{isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}</span>
            </button>
            <div className="song-meta">
              <button className="song-title" onClick={activate}>
                {song.title}
              </button>
              <p className="song-sub">
                {song.artistId ? (
                  <button
                    className="link"
                    onClick={() => onOpenArtist(song.artistId)}
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
                        onClick={() => onOpenAlbum(song.albumId)}
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
            {onAddToPlaylist && (
              <button
                className="song-add-to-playlist"
                type="button"
                aria-label={`Añadir ${song.title} a una playlist`}
                title="Añadir a playlist"
                onClick={() => onAddToPlaylist(asPlaylistSong(song))}
              >
                <ListPlus size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            <DownloadButton song={song} {...downloadProps} />
          </li>
        );
      })}
    </ol>
  );
}
