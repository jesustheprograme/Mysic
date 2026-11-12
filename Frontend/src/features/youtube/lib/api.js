// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/lib/api.js
// Único punto de acceso al backend: rutas, URLs de medios y llamadas JSON.
// En desarrollo las rutas son relativas y Vite las reenvía al backend (vite.config.js).
import { API_URL } from '../../../lib/api.js';
// Integración propia de Mysic: caché única de álbum, playlist y artista (precarga y clic comparten petición).
import { createDetailCache } from '../detailCache.js';

export const API_BASE = `${API_URL}/youtube`;

const SEARCH_WARM_TTL_MS = 2 * 60_000;
const SEARCH_WARM_LIMIT = 12;
const warmedSearches = new Map();
const DETAIL_CACHE_TTL_MS = 5 * 60_000;
const DETAIL_CACHE_LIMIT = 30;
const detailRequests = new Map();
const STREAM_WARM_TTL_MS = 5 * 60_000;
const STREAM_WARM_LIMIT = 30;
const warmedStreams = new Map();
const details = createDetailCache({ fetcher: (path) => fetchJson(path, undefined, 1) });
export const setDetailScope = (scope) => details.setScope(scope);
export const clearDetailScope = (scope) => details.clearScope(scope);

function searchKey(q, type) {
  return `${type}:${q.trim().toLocaleLowerCase()}`;
}

function pruneWarmedSearches(now = Date.now()) {
  for (const [key, entry] of warmedSearches) {
    if (now - entry.createdAt > SEARCH_WARM_TTL_MS) warmedSearches.delete(key);
  }
  while (warmedSearches.size > SEARCH_WARM_LIMIT) {
    warmedSearches.delete(warmedSearches.keys().next().value);
  }
}

function waitForSharedRequest(request, signal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Solicitud cancelada', 'AbortError'));

  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Solicitud cancelada', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function cachedJson(cache, key, path, signal, ttlMs, limit) {
  const now = Date.now();
  for (const [cachedKey, entry] of cache) {
    if (now - entry.createdAt > ttlMs) cache.delete(cachedKey);
  }
  let entry = cache.get(key);
  if (!entry) {
    const request = fetchJson(path).catch((error) => {
      cache.delete(key);
      throw error;
    });
    request.catch(() => {});
    entry = { createdAt: now, request };
    cache.set(key, entry);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
  }
  return waitForSharedRequest(entry.request, signal);
}

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

function warmSearch(q, type = 'song') {
  const trimmed = q.trim();
  if (trimmed.length < 2) return;
  const key = searchKey(trimmed, type);
  const now = Date.now();
  pruneWarmedSearches(now);
  if (warmedSearches.has(key)) return;
  const request = fetchJson(`/search?q=${encodeURIComponent(trimmed)}&type=${type}`)
    .catch((error) => {
      warmedSearches.delete(key);
      throw error;
    });
  // Attach a handler now so an abandoned warm-up can never become unhandled.
  request.catch(() => {});
  warmedSearches.set(key, { createdAt: now, request });
}

function search(q, type, signal) {
  const key = searchKey(q, type);
  pruneWarmedSearches();
  let warmed = warmedSearches.get(key);
  if (!warmed) {
    const request = fetchJson(`/search?q=${encodeURIComponent(q)}&type=${type}`)
      .catch((error) => {
        warmedSearches.delete(key);
        throw error;
      });
    request.catch(() => {});
    warmed = { createdAt: Date.now(), request };
    warmedSearches.set(key, warmed);
  }
  return waitForSharedRequest(warmed.request, signal);
}

function detail(key, path, signal) {
  return cachedJson(detailRequests, key, path, signal, DETAIL_CACHE_TTL_MS, DETAIL_CACHE_LIMIT);
}

/* ---------- URLs de medios ---------- */
export const streamUrl = (id) => `${API_BASE}/stream/${id}`;
export const localAudioUrl = (id) => `${API_BASE}/downloads/${id}/audio`;

// Resuelve y deja en la caché del backend la URL firmada de YouTube. No descarga el audio:
// el <audio> que realmente vaya a sonar abre /stream/:id después y reutiliza la resolución.
export function warmStream(id) {
  if (!id) return Promise.resolve();
  const key = String(id);
  const now = Date.now();
  for (const [cachedId, entry] of warmedStreams) {
    if (now - entry.createdAt > STREAM_WARM_TTL_MS) warmedStreams.delete(cachedId);
  }
  let entry = warmedStreams.get(key);
  if (!entry) {
    const request = fetchJson(`/stream/${encodeURIComponent(key)}/info`, undefined, 0)
      .catch((error) => {
        warmedStreams.delete(key);
        throw error;
      });
    request.catch(() => {});
    entry = { createdAt: now, request };
    warmedStreams.set(key, entry);
    while (warmedStreams.size > STREAM_WARM_LIMIT) warmedStreams.delete(warmedStreams.keys().next().value);
  }
  return entry.request;
}

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
  connectCapturedSession: (session) => send('/link/session', 'POST', session),
  accountLinkStatus: (signal) => fetchJson('/link/status', signal),
  unlinkAccount: () => send('/link', 'DELETE'),
  officialLibrary: (accessToken) => send('/official/library', 'POST', { accessToken }),
  sessionLibrary: ({ fresh = false, signal } = {}) => fetchJson(`/library${fresh ? '?fresh=1' : ''}`, signal),
  home: (signal) => fetchJson('/home', signal),
  explore: (signal) => fetchJson('/explore', signal),
  radio: (id, signal) => fetchJson(`/radio/${encodeURIComponent(id)}`, signal),
  playlist: (id, signal) => details.get('playlist', id, `/playlist/${encodeURIComponent(id)}`, signal),
  recommendations: (id, signal) => fetchJson(`/recommendations/${encodeURIComponent(id)}`, signal),
  search,
  warmSearch,
  suggest: (q, signal) => detail(`suggest:${q.trim().toLocaleLowerCase()}`, `/suggest?q=${encodeURIComponent(q)}`, signal),
  artist: (id, signal) => details.get('artist', id, `/artist/${encodeURIComponent(id)}`, signal),
  prefetchArtist: (id) => details.get('artist', id, `/artist/${encodeURIComponent(id)}`).catch(() => {}),
  prefetchAlbum: (id) => details.get('album', id, `/album/${encodeURIComponent(id)}`).catch(() => {}),
  prefetchPlaylist: (id) => details.get('playlist', id, `/playlist/${encodeURIComponent(id)}`).catch(() => {}),
  warmStream,
  artistReleases: (id, signal) => detail(`artist-releases:${id}`, `/artist/${encodeURIComponent(id)}/releases`, signal),
  artistTopSongs: (id, signal) => detail(`artist-top-songs:${id}`, `/artist/${encodeURIComponent(id)}/top-songs`, signal),
  artistSongs: (id, signal) => fetchJson(`/artist/${encodeURIComponent(id)}/songs`, signal),
  artistImages: (id, signal) => fetchJson(`/artist/${id}/images`, signal),
  album: (id, signal) => details.get('album', id, `/album/${encodeURIComponent(id)}`, signal),
  downloads: {
    list: () => fetchJson('/downloads'),
    add: (song) => send('/downloads', 'POST', { song }),
    remove: (id) => send(`/downloads/${id}`, 'DELETE'),
  },
};
