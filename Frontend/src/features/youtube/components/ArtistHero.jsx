// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/ArtistHero.jsx
// Panel de fotos del artista a toda altura: las fotos van cambiando con fundido
// (máximo 5) y se eligen con pastillas. Cada foto se encuadra según su punto de
// interés (calculado en el backend) para que la cara no quede fuera del panel.
// El contenido superpuesto (nombre, botones) lo aporta la vista mediante `children`.
// Arranca con la foto de YouTube que trae la página y, si no venía completo,
// pide al backend el conjunto ampliado y sin repetidas (YouTube + Discogs + Deezer).
import { useEffect, useState } from 'react';
import { api, imageUrl } from '../lib/api.js';
import { NoteIcon } from './icons.jsx';

const HERO_INTERVAL_MS = 6000;
const HERO_MAX_IMAGES = 5;

const toEntries = (list) =>
  list
    .map((item) => (typeof item === 'string' ? { url: item, focus: null } : item))
    .filter((item) => item?.url)
    .slice(0, HERO_MAX_IMAGES);

export function ArtistHero({ artistId, initialImages, complete = false, children }) {
  const [images, setImages] = useState(() => toEntries(initialImages));
  // La foto actual se identifica por URL: así, cuando llega el conjunto
  // ampliado, la que se está viendo no cambia aunque cambie su posición.
  const [currentUrl, setCurrentUrl] = useState(() => toEntries(initialImages)[0]?.url ?? null);
  const [paused, setPaused] = useState(false);

  const currentIndex = Math.max(0, images.findIndex((img) => img.url === currentUrl));

  // Si la página ya trajo el conjunto completo, no hace falta pedir más
  useEffect(() => {
    if (complete) return undefined;
    const controller = new AbortController();
    api
      .artistImages(artistId, controller.signal)
      .then((data) => {
        const entries = toEntries(data.images || []);
        if (entries.length > 0) setImages(entries);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('Sin fotos adicionales del artista:', err.message);
      });
    return () => controller.abort();
  }, [artistId, complete]);

  // Avance automático (se pausa con el ratón encima)
  useEffect(() => {
    if (paused || images.length < 2) return undefined;
    const timer = setInterval(() => {
      setCurrentUrl((url) => {
        const i = images.findIndex((img) => img.url === url);
        return images[(i + 1) % images.length].url;
      });
    }, HERO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, images]);

  const removeImage = (url) => setImages((prev) => prev.filter((img) => img.url !== url));

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrusel"
      aria-label="Fotos del artista"
    >
      <div className="hero-media" aria-hidden="true">
        {images.length === 0 && (
          <span className="hero-image hero-image--active hero-image--empty">
            <NoteIcon />
          </span>
        )}
        {images.map((img, i) => (
          <img
            key={img.url}
            className={`hero-image${i === currentIndex ? ' hero-image--active' : ''}`}
            src={imageUrl(img.url)}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            draggable="false"
            style={img.focus ? { objectPosition: `${img.focus.x}% ${img.focus.y}%` } : undefined}
            onError={() => removeImage(img.url)}
          />
        ))}
        <span className="hero-shade" />
      </div>

      <div className="hero-overlay">{children}</div>

      {images.length > 1 && (
        <div className="hero-dots" role="tablist" aria-label="Elegir foto">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`Foto ${i + 1} de ${images.length}`}
              className={`hero-dot${i === currentIndex ? ' hero-dot--active' : ''}`}
              onClick={() => setCurrentUrl(img.url)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
