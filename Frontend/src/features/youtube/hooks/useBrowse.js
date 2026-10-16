// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/hooks/useBrowse.js
// Búsqueda y navegación entre vistas: resultados, artista, álbum y descargas.
import { useCallback, useState } from 'react';
import { api } from '../lib/api.js';
import { scrollAppToTop } from '../lib/scroll.js';
import { useSearchHistory } from './useSearchHistory.js';

async function loadArtist(id) {
  const artist = await api.artist(id);
  const topSongs = await Promise.all(
    artist.topSongs.map(async (song) => {
      if (song.durationSeconds > 0) return song;

      try {
        const result = await api.search(song.title, 'song');
        const completeSong = result.items?.find((candidate) => candidate.id === song.id);
        return completeSong ? { ...song, ...completeSong } : song;
      } catch {
        return song;
      }
    })
  );

  return { ...artist, topSongs };
}

export const SEARCH_TABS = [
  { type: 'all', label: 'Todo' },
  { type: 'song', label: 'Canciones' },
  { type: 'artist', label: 'Artistas' },
  { type: 'album', label: 'Álbumes' },
];

export function useBrowse() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState(null); // respuesta de /search + query
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // { kind: 'search' } | { kind: 'artist', data } | { kind: 'album', data } | { kind: 'downloads' }
  const [view, setView] = useState({ kind: 'search' });
  const history = useSearchHistory();

  const runSearch = useCallback(
    async (text, type) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setLoading(true);
      setError('');
      setView({ kind: 'search' });
      history.add(trimmed);
      try {
        const data = await api.search(trimmed, type);
        setResults({ ...data, query: trimmed });
        const empty =
          data.type === 'all'
            ? !data.top && !data.songs.length && !data.artists.length && !data.albums.length
            : data.items.length === 0;
        if (empty) setError('No se encontraron resultados.');
      } catch (err) {
        console.error('Error de búsqueda:', err);
        setError(
          err.message.includes('fetch') ? 'No se pudo conectar con el servidor. ¿Está el backend arrancado?' : err.message
        );
      } finally {
        setLoading(false);
      }
    },
    [history]
  );

  const changeTab = (type) => {
    setSearchType(type);
    if (results?.query) runSearch(results.query, type);
    else setView({ kind: 'search' });
  };

  const openDetail = useCallback(async (kind, load) => {
    setLoading(true);
    setError('');
    try {
      const data = await load();
      setView({ kind, data });
      scrollAppToTop();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openArtist = useCallback((id) => id && openDetail('artist', () => loadArtist(id)), [openDetail]);
  const openAlbum = useCallback((id) => id && openDetail('album', () => api.album(id)), [openDetail]);

  const showDownloads = () => {
    setError('');
    setView({ kind: 'downloads' });
  };

  const goBack = () => {
    setError('');
    setView({ kind: 'search' });
  };

  return {
    query,
    setQuery,
    searchType,
    results,
    loading,
    error,
    view,
    history: history.history,
    removeFromHistory: history.remove,
    runSearch,
    changeTab,
    openArtist,
    openAlbum,
    showDownloads,
    goBack,
  };
}
