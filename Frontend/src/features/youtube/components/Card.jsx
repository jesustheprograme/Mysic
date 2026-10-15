// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/Card.jsx
// Tarjeta de artista (redonda) o álbum, y las rejillas que las agrupan.
import { Cover } from './Cover.jsx';
import { PlayIcon } from './icons.jsx';

export function Card({ image, title, subtitle, round, onClick }) {
  return (
    <button className={`card${round ? ' card--round' : ''}`} onClick={onClick} title={title}>
      <div className="card-image">
        <Cover className="cover-fill" src={image} lazy />
        <span className="card-play">
          <PlayIcon />
        </span>
      </div>
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-sub">{subtitle}</div>}
    </button>
  );
}

export function ArtistGrid({ artists, onOpenArtist }) {
  return (
    <div className="grid">
      {artists.map((artist) => (
        <Card
          key={artist.id}
          round
          image={artist.thumbnail}
          title={artist.name}
          subtitle={artist.subtitle}
          onClick={() => onOpenArtist(artist.id)}
        />
      ))}
    </div>
  );
}

export function AlbumGrid({ albums, onOpenAlbum }) {
  return (
    <div className="grid">
      {albums.map((album) => (
        <Card
          key={album.id}
          image={album.thumbnail}
          title={album.title}
          subtitle={[album.kind !== 'Álbum' ? album.kind : album.artist, album.year].filter(Boolean).join(' • ')}
          onClick={() => onOpenAlbum(album.id)}
        />
      ))}
    </div>
  );
}
