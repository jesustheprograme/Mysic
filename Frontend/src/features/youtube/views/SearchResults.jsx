// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/views/SearchResults.jsx
// Resultados de búsqueda: vista "Todo" (resultado principal + resúmenes) o
// la lista/rejilla de la pestaña activa.
import { AlbumGrid, ArtistGrid } from '../components/Card.jsx';
import { Cover } from '../components/Cover.jsx';
import { ArrowIcon, PauseIcon, PlayIcon } from '../components/icons.jsx';
import { SectionHeader } from '../components/SectionHeader.jsx';
import { SongList } from '../components/SongList.jsx';

export function SearchResults({ results, loading, error, songListProps, onOpenArtist, onOpenAlbum, onShowAll }) {
  if (!results) {
    return !loading && !error ? (
      <p className="message">Busca canciones, artistas o álbumes para empezar a escuchar.</p>
    ) : null;
  }
  if (results.type === 'all') {
    return (
      <AllResults
        results={results}
        songListProps={songListProps}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onShowAll={onShowAll}
      />
    );
  }
  const labels = { song: 'Canciones', artist: 'Artistas', album: 'Álbumes' };
  return (
    <section className="result-collection">
      <div className="section-heading">
        <div>
          <p className="section-eyebrow">Resultados</p>
          <h2 className="section-title">{labels[results.type]}</h2>
        </div>
        <span className="section-count">{results.items.length}</span>
      </div>
      {results.items.length === 0 ? (
        <p className="message message--surface">No encontramos resultados en esta categoría.</p>
      ) : results.type === 'song' ? (
        <SongList songs={results.items} {...songListProps} />
      ) : results.type === 'artist' ? (
        <ArtistGrid artists={results.items} onOpenArtist={onOpenArtist} />
      ) : (
        <AlbumGrid albums={results.items} onOpenAlbum={onOpenAlbum} />
      )}
    </section>
  );
}

function AllResults({ results, songListProps, onOpenArtist, onOpenAlbum, onShowAll }) {
  const { top, songs, artists, albums } = results;
  const { currentId, isPlaying, onPlay, onTogglePlay } = songListProps;

  const openTop = () => {
    if (!top) return;
    if (top.kind === 'artist') onOpenArtist(top.id);
    else if (top.kind === 'album') onOpenAlbum(top.id);
    else if (top.kind === 'song') {
      if (top.id === currentId) onTogglePlay();
      else onPlay([top.song, ...songs.filter((s) => s.id !== top.id)], 0);
    }
  };
  const topKind = top?.kind === 'artist' ? 'Artista' : top?.kind === 'album' ? 'Álbum' : 'Canción';

  return (
    <div className="all-results">
      {top && (
        <>
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Mejor coincidencia</p>
              <h3 className="section-title">Resultado principal</h3>
            </div>
          </div>
          <button className="top-card" onClick={openTop} style={{ '--top-artwork': `url("${top.thumbnail || ''}")` }}>
            <span className="top-card-ambient" aria-hidden="true" />
            <Cover className="top-card-image" round={top.kind === 'artist'} src={top.thumbnail} />
            <div className="top-card-body">
              <span className="top-card-kind">{topKind}</span>
              <div className="top-card-title">{top.title}</div>
              <div className="top-card-sub">{top.subtitle}</div>
            </div>
            <span className="top-card-action">
              {top.kind === 'song' ? (top.id === currentId && isPlaying ? <PauseIcon /> : <PlayIcon />) : <ArrowIcon />}
            </span>
          </button>
        </>
      )}

      {songs.length > 0 && (
        <>
          <SectionHeader title="Canciones" onShowAll={songs.length > 5 ? () => onShowAll('song') : null} />
          <SongList songs={songs} limit={5} {...songListProps} />
        </>
      )}

      {artists.length > 0 && (
        <>
          <SectionHeader title="Artistas" onShowAll={artists.length > 6 ? () => onShowAll('artist') : null} />
          <ArtistGrid artists={artists.slice(0, 6)} onOpenArtist={onOpenArtist} />
        </>
      )}

      {albums.length > 0 && (
        <>
          <SectionHeader title="Álbumes" onShowAll={albums.length > 6 ? () => onShowAll('album') : null} />
          <AlbumGrid albums={albums.slice(0, 6)} onOpenAlbum={onOpenAlbum} />
        </>
      )}
    </div>
  );
}
