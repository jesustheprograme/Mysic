// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// Búsqueda y navegación entre vistas: resultados, artista, álbum y descargas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { scrollAppToTop } from '../lib/scroll.js';
import { useSearchHistory } from './useSearchHistory.js';

const SEARCH_SECTIONS = [
  ['song', 'songs'],
  ['artist', 'artists'],
  ['album', 'albums'],
];

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

function hasResults(results) {
  if (results.type !== 'all') return results.items.length > 0;
  return Boolean(results.top || results.songs.length || results.artists.length || results.albums.length);
}

export function useBrowse() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState({ kind: 'search' });
  const { history, add: addHistory, remove: removeFromHistory } = useSearchHistory();
  const searchControllerRef = useRef(null);
  const searchSequenceRef = useRef(0);

  const cancelSearch = useCallback(() => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setLoading(false);
    setEnriching(false);
  }, []);

  useEffect(() => () => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
  }, []);

  const runSearch = useCallback(async (text, type) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    const sequence = ++searchSequenceRef.current;
    searchControllerRef.current = controller;
    setQuery(trimmed);
    setLoading(true);
    setEnriching(type === 'all');
    setError('');
    setView({ kind: 'search' });
    addHistory(trimmed);

    try {
      if (type !== 'all') {
        const data = await api.search(trimmed, type, controller.signal);
        if (sequence !== searchSequenceRef.current) return;
        setResults({ ...data, query: trimmed });
        if (!hasResults(data)) setError('No se encontraron resultados.');
        return;
      }

      // Las consultas secundarias empiezan ya, pero no bloquean el primer resultado visual.
      const sectionsPromise = Promise.allSettled(SEARCH_SECTIONS.map(async ([sectionType, key]) => {
        const section = await api.search(trimmed, sectionType, controller.signal);
        if (sequence === searchSequenceRef.current) {
          setResults((current) => current?.query === trimmed
            ? { ...current, [key]: section.items }
            : current);
        }
        return { key, items: section.items };
      }));
      const primary = await api.search(trimmed, 'all', controller.signal);
      if (sequence !== searchSequenceRef.current) return;

      let complete = { ...primary, query: trimmed };
      setResults(complete);
      setLoading(false);

      const settled = await sectionsPromise;
      if (sequence !== searchSequenceRef.current) return;

      settled.forEach((result) => {
        if (result.status === 'fulfilled') {
          complete = { ...complete, [result.value.key]: result.value.items };
        }
      });
      setResults(complete);
      if (!hasResults(complete)) setError('No se encontraron resultados.');
    } catch (err) {
      if (err.name === 'AbortError' || sequence !== searchSequenceRef.current) return;
      console.error('Error de búsqueda:', err);
      setError(
        err.message.includes('fetch') ? 'No se pudo conectar con el servidor. ¿Está el backend arrancado?' : err.message
      );
    } finally {
      if (sequence === searchSequenceRef.current) {
        searchControllerRef.current = null;
        setLoading(false);
        setEnriching(false);
      }
    }
  }, [addHistory]);

  const changeTab = (type) => {
    setSearchType(type);
    if (results?.query) runSearch(results.query, type);
    else setView({ kind: 'search' });
  };

  const openDetail = useCallback(async (kind, load) => {
    cancelSearch();
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
  }, [cancelSearch]);

  const openArtist = useCallback((id) => id && openDetail('artist', () => loadArtist(id)), [openDetail]);
  const openAlbum = useCallback((id) => id && openDetail('album', () => api.album(id)), [openDetail]);

  const showDownloads = () => {
    cancelSearch();
    setError('');
    setView({ kind: 'downloads' });
  };

  const goBack = () => {
    cancelSearch();
    setError('');
    setView({ kind: 'search' });
  };

  return {
    query,
    setQuery,
    searchType,
    results,
    loading,
    enriching,
    error,
    view,
    history,
    removeFromHistory,
    runSearch,
    changeTab,
    openArtist,
    openAlbum,
    showDownloads,
    goBack,
  };
}
