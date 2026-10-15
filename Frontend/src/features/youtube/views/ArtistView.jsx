// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/views/ArtistView.jsx
// Página de artista a dos columnas: a la izquierda el panel de fotos con el
// nombre y las acciones superpuestas; a la derecha el catálogo (canciones
// destacadas) y la discografía (álbumes y sencillos).
import { ArtistHero } from '../components/ArtistHero.jsx';
import { AlbumGrid } from '../components/Card.jsx';
import { DownloadAllButton } from '../components/DownloadButton.jsx';
import { BackIcon, DiscIcon, PlayIcon, QueueIcon, ShuffleIcon } from '../components/icons.jsx';
import { SongList } from '../components/SongList.jsx';

// Los títulos de las estanterías llegan en inglés desde YouTube
const SHELF_TITLES = {
  Albums: 'Álbumes',
  'Singles & EPs': 'Sencillos y EP',
  Singles: 'Sencillos',
};

export function ArtistView({ artist, songListProps, onOpenAlbum, onBack }) {
  const releases = artist.shelves.reduce((sum, shelf) => sum + shelf.items.length, 0);
  const meta = [
    artist.topSongs.length > 0 && `${artist.topSongs.length} canciones destacadas`,
    releases > 0 && `${releases} lanzamientos`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="artist-page">
      <ArtistHero
        artistId={artist.id}
        initialImages={artist.images?.length ? artist.images : [artist.thumbnail]}
        complete={Boolean(artist.imagesComplete)}
      >
        <button className="hero-back" onClick={onBack} aria-label="Volver a resultados" title="Volver">
          <BackIcon />
        </button>

        <div className="hero-info">
          <p className="hero-kind">Artista</p>
          <h1 className="hero-name">{artist.name}</h1>
          {meta && <p className="hero-meta">{meta}</p>}
          {artist.topSongs.length > 0 && (
            <div className="hero-actions">
              <button className="pill pill--primary" onClick={() => songListProps.onPlay(artist.topSongs, 0)}>
                <PlayIcon /> Reproducir
              </button>
              <button className="pill" onClick={() => songListProps.onPlayShuffled(artist.topSongs)}>
                <ShuffleIcon /> Aleatorio
              </button>
              <DownloadAllButton songs={artist.topSongs} {...songListProps} />
            </div>
          )}
        </div>
      </ArtistHero>

      <div className="artist-content">
        {artist.topSongs.length > 0 && (
          <section className="catalog-section">
            <header className="catalog-header">
              <span className="catalog-icon">
                <QueueIcon />
              </span>
              <div>
                <p className="catalog-eyebrow">Catálogo</p>
                <h2 className="catalog-title">Canciones destacadas</h2>
              </div>
            </header>
            <SongList songs={artist.topSongs} {...songListProps} hideAlbum />
          </section>
        )}

        {artist.shelves.length > 0 && (
          <section className="catalog-section">
            <header className="catalog-header">
              <span className="catalog-icon">
                <DiscIcon />
              </span>
              <div>
                <p className="catalog-eyebrow">Discografía</p>
                <h2 className="catalog-title">Lanzamientos</h2>
              </div>
            </header>
            {artist.shelves.map((shelf) => (
              <div key={shelf.title} className="catalog-group">
                <h3 className="catalog-group-title">{SHELF_TITLES[shelf.title] || shelf.title}</h3>
                <AlbumGrid albums={shelf.items} onOpenAlbum={onOpenAlbum} />
              </div>
            ))}
          </section>
        )}

        {artist.description && (
          <section className="catalog-section">
            <header className="catalog-header catalog-header--plain">
              <div>
                <p className="catalog-eyebrow">Biografía</p>
                <h2 className="catalog-title">Acerca de {artist.name}</h2>
              </div>
            </header>
            <p className="artist-bio">{artist.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
