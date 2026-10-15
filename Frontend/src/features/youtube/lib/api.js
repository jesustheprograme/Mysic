// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/lib/api.js
// Único punto de acceso al backend: rutas, URLs de medios y llamadas JSON.
// En desarrollo las rutas son relativas y Vite las reenvía al backend (vite.config.js).
import { API_URL } from '../../../lib/api.js';

export const API_BASE = `${API_URL}/youtube`;

export async function fetchJson(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error del servidor (${response.status})`);
  return data;
}

async function send(path, method, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error del servidor (${response.status})`);
  return data;
}

/* ---------- URLs de medios ---------- */
export const streamUrl = (id) => `${API_BASE}/stream/${id}`;
export const localAudioUrl = (id) => `${API_BASE}/downloads/${id}/audio`;

// Las carátulas remotas pasan por el proxy del backend (caché en disco y sin bloqueos del navegador).
// Las rutas relativas (p. ej. carátulas de descargas) se dejan tal cual.
export const imageUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return `${API_BASE}/image?u=${encodeURIComponent(url)}`;
  if (url.startsWith('/api/')) return `${API_BASE}${url.slice(4)}`;
  return url;
};

/* ---------- Endpoints ---------- */
export const api = {
  search: (q, type, signal) => fetchJson(`/search?q=${encodeURIComponent(q)}&type=${type}`, signal),
  suggest: (q, signal) => fetchJson(`/suggest?q=${encodeURIComponent(q)}`, signal),
  artist: (id) => fetchJson(`/artist/${id}`),
  artistImages: (id, signal) => fetchJson(`/artist/${id}/images`, signal),
  album: (id) => fetchJson(`/album/${id}`),
  downloads: {
    list: () => fetchJson('/downloads'),
    add: (song) => send('/downloads', 'POST', { song }),
    remove: (id) => send(`/downloads/${id}`, 'DELETE'),
  },
};
