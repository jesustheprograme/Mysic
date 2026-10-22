// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/lib/api.js
// Único punto de acceso al backend: rutas, URLs de medios y llamadas JSON.
// En desarrollo las rutas son relativas y Vite las reenvía al backend (vite.config.js).
import { API_URL } from '../../../lib/api.js';

export const API_BASE = `${API_URL}/youtube`;

function apiError(data, status) {
  const error = new Error(data.error || data.message || data.detail || `Error del servidor (${status})`);
  error.status = status;
  return error;
}

function readJson(response) {
  return response.json().catch(() => ({}));
}

async function readError(response) {
  return apiError(await readJson(response), response.status);
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Solicitud cancelada', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Solicitud cancelada', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function fetchJson(path, signal, retries = 2) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', signal });
  if (!response.ok && response.status === 503 && retries > 0) {
    await waitForRetry(500, signal);
    return fetchJson(path, signal, retries - 1);
  }
  if (!response.ok) throw await readError(response);
  return readJson(response);
}

async function send(path, method, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await readError(response);
  return readJson(response);
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
  account: (signal) => fetchJson('/account', signal),
  startAccountLink: () => send('/link/start', 'POST'),
  connectMusicSession: (requestText) => send('/link/browser', 'POST', { requestText }),
  accountLinkStatus: (signal) => fetchJson('/link/status', signal),
  unlinkAccount: () => send('/link', 'DELETE'),
  home: (signal) => fetchJson(`/home?variant=${Date.now()}`, signal),
  explore: (signal) => fetchJson('/explore', signal),
  radio: (id, signal) => fetchJson(`/radio/${encodeURIComponent(id)}`, signal),
  playlist: (id, signal) => fetchJson(`/playlist/${encodeURIComponent(id)}`, signal),
  recommendations: (id, signal) => fetchJson(`/recommendations/${encodeURIComponent(id)}`, signal),
  search: (q, type, signal) => fetchJson(`/search?q=${encodeURIComponent(q)}&type=${type}`, signal),
  suggest: (q, signal) => fetchJson(`/suggest?q=${encodeURIComponent(q)}`, signal),
  artist: (id, signal) => fetchJson(`/artist/${encodeURIComponent(id)}`, signal),
  artistImages: (id, signal) => fetchJson(`/artist/${id}/images`, signal),
  album: (id, signal) => fetchJson(`/album/${encodeURIComponent(id)}`, signal),
  downloads: {
    list: () => fetchJson('/downloads'),
    add: (song) => send('/downloads', 'POST', { song }),
    remove: (id) => send(`/downloads/${id}`, 'DELETE'),
  },
};
