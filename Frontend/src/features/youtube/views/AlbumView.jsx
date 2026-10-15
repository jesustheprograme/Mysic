// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/views/AlbumView.jsx
// Página de álbum: carátula, datos, "Reproducir", "Descargar todo" y pistas numeradas.
import { Cover } from '../components/Cover.jsx';
import { DownloadAllButton } from '../components/DownloadButton.jsx';
import { PlayIcon } from '../components/icons.jsx';
import { SongList } from '../components/SongList.jsx';

export function AlbumView({ album, songListProps, onOpenArtist }) {
  return (
    <section>
      <header className="detail">
        <Cover className="detail-cover" src={album.thumbnail} />
        <div className="detail-meta">
          <p className="detail-kind">Álbum</p>
          <h2 className="detail-title">{album.title}</h2>
          <p className="detail-sub">
            {album.artistId ? (
              <button className="link" onClick={() => onOpenArtist(album.artistId)}>
                {album.artist}
              </button>
            ) : (
              album.artist
            )}
            {album.year && ` • ${album.year}`}
            {album.info && ` • ${album.info}`}
          </p>
          {album.tracks.length > 0 && (
            <div className="detail-actions">
              <button className="play-all" onClick={() => songListProps.onPlay(album.tracks, 0)}>
                <PlayIcon /> Reproducir
              </button>
              <DownloadAllButton songs={album.tracks} {...songListProps} />
            </div>
          )}
        </div>
      </header>
      <SongList songs={album.tracks} {...songListProps} hideAlbum showIndex />
    </section>
  );
}
