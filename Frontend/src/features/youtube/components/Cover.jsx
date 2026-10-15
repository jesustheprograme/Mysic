// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/Cover.jsx
// Carátula que pasa por el proxy del backend y muestra un marcador de
// posición (nota musical) si la imagen no existe o falla al cargar.
import { useState } from 'react';
import { imageUrl } from '../lib/api.js';
import { NoteIcon } from './icons.jsx';

export function Cover({ src, className = '', round, lazy }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const resolved = imageUrl(src);
  const roundClass = round ? ' cover--round' : '';
  if (!resolved || failedSrc === resolved) {
    return (
      <span className={`${className} cover-fallback${roundClass}`} aria-hidden="true">
        <NoteIcon />
      </span>
    );
  }
  return (
    <img
      className={`${className}${roundClass}`}
      src={resolved}
      alt=""
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
      onError={() => setFailedSrc(resolved)}
    />
  );
}
