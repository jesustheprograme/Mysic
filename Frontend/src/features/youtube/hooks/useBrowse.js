// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// Búsqueda y navegación entre vistas: resultados, artista, álbum y descargas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { readIndexedSearch, writeIndexedSearch } from '../lib/searchIndex.js';
import { rankSearchResult } from '../lib/searchRanking.js';
import { scrollAppToTop } from '../lib/scroll.js';
import { useSearchHistory } from './useSearchHistory.js';

const SEARCH_SECTIONS = [
  ['song', 'songs'],
  ['artist', 'artists'],
  ['album', 'albums'],
];

function scheduleWhenIdle(callback) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(callback, { timeout: 1_200 });
    return () => globalThis.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 500);
  return () => globalThis.clearTimeout(id);
}

async function loadArtist(id) {
  return api.artist(id);
}

export const SEARCH_TABS = [
  { type: 'all', label: 'Todo' },
  { type: 'song', label: 'Canciones' },
  { type: 'artist', label: 'Artistas' },
  { type: 'album', label: 'Álbumes' },
];

function hasResults(results) {
  if (!results) return false;
  if (results.type !== 'all') return Boolean(results.items?.length);
  return Boolean(results.top || results.songs?.length || results.artists?.length || results.albums?.length);
}

export function useBrowse({ progressive = false } = {}) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState({ kind: 'search' });
  const { history, add: addHistory, remove: removeFromHistory } = useSearchHistory();
  const searchControllerRef = useRef(null);
  const enrichmentCancelRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const sectionRequestsRef = useRef(new Map());
  const searchContextRef = useRef(null);

  const cancelSearch = useCallback(() => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    enrichmentCancelRef.current?.();
    enrichmentCancelRef.current = null;
    setLoading(false);
    setEnriching(false);
  }, []);

  useEffect(() => () => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
    enrichmentCancelRef.current?.();
  }, []);

  const showCatalog = useCallback(() => {
    cancelSearch();
    // Returning from a detail view must allow unfinished sections to load again.
    if (searchContextRef.current) {
      const controller = new AbortController();
      searchControllerRef.current = controller;
      searchContextRef.current = {
        ...searchContextRef.current, controller, sequence: searchSequenceRef.current,
      };
      sectionRequestsRef.current.clear();
    }
    setError('');
    setView({ kind: 'search' });
  }, [cancelSearch]);

  useEffect(() => {
    globalThis.addEventListener?.('mysic:global-home', showCatalog);
    return () => globalThis.removeEventListener?.('mysic:global-home', showCatalog);
  }, [showCatalog]);

  const runSearch = useCallback(async (text, type) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    searchControllerRef.current?.abort();
    enrichmentCancelRef.current?.();
    enrichmentCancelRef.current = null;
    const controller = new AbortController();
    const sequence = ++searchSequenceRef.current;
    searchControllerRef.current = controller;
    setQuery(trimmed);
    sectionRequestsRef.current.clear();
    searchContextRef.current = { query: trimmed, sequence, controller };
    setResults(null);
    setLoading(true);
    setEnriching(type === 'all');
    setError('');
    setView({ kind: 'search' });
    addHistory(trimmed);

    let indexedResultsShown = false;
    let deferredEnrichment = false;

    try {
      // Attach rejection handling immediately, even while IndexedDB is opening.
      const networkRequest = api.search(trimmed, progressive && type === 'all' ? 'song' : type, controller.signal)
        .then((data) => ({ data }), (error) => ({ error }));
      const indexed = rankSearchResult(await Promise.race([
        readIndexedSearch(trimmed, type),
        new Promise((resolve) => setTimeout(() => resolve(null), 80)),
      ]), trimmed);

      if (sequence !== searchSequenceRef.current) return;
      if (hasResults(indexed)) {
        indexedResultsShown = true;
        setResults({ ...indexed, query: trimmed });
        setLoading(false);
        setEnriching(true);
      }

      const response = await networkRequest;
      if (response.error) throw response.error;
      const primary = rankSearchResult(progressive && type === 'all'
        ? { type: 'all', songs: response.data.items || [], artists: [], albums: [], pending: ['artist', 'album'] }
        : response.data, trimmed);
      if (sequence !== searchSequenceRef.current) return;
      void writeIndexedSearch(trimmed, type, primary);

      if (type !== 'all') {
        setResults({ ...primary, query: trimmed });
        if (!hasResults(primary)) setError('No se encontraron resultados.');
        return;
      }

      if (progressive) {
        setResults((current) => ({
          ...primary, query: trimmed,
          artists: current?.query === trimmed ? current.artists || [] : [],
          albums: current?.query === trimmed ? current.albums || [] : [],
          pending: current?.query === trimmed && current.pending ? current.pending : primary.pending,
        }));
        return;
      }
      setResults({ ...primary, query: trimmed });
      const missingSections = SEARCH_SECTIONS.filter(([, key]) => !primary[key]?.length);

      if (!missingSections.length) {
        if (!hasResults(primary)) setError('No se encontraron resultados.');
        return;
      }

      deferredEnrichment = true;
      setEnriching(true);
      enrichmentCancelRef.current = scheduleWhenIdle(async () => {
        try {
          const settled = await Promise.allSettled(missingSections.map(async ([sectionType, key]) => {
            const section = rankSearchResult(
              await api.search(trimmed, sectionType, controller.signal),
              trimmed,
            );
            return { sectionType, key, data: section };
          }));
          if (sequence !== searchSequenceRef.current) return;

          let complete = { ...primary };
          settled.forEach((result) => {
            if (result.status !== 'fulfilled' || !result.value.data?.items?.length) return;
            complete = { ...complete, [result.value.key]: result.value.data.items };
            void writeIndexedSearch(trimmed, result.value.sectionType, result.value.data);
          });
          complete = rankSearchResult(complete, trimmed);
          setResults({ ...complete, query: trimmed });
          void writeIndexedSearch(trimmed, 'all', complete);
          if (!hasResults(complete)) setError('No se encontraron resultados.');
        } finally {
          if (sequence === searchSequenceRef.current) {
            searchControllerRef.current = null;
            enrichmentCancelRef.current = null;
            setEnriching(false);
          }
        }
      });
    } catch (err) {
      if (err.name === 'AbortError' || sequence !== searchSequenceRef.current) return;
      console.error('Error de búsqueda:', err);
      if (!indexedResultsShown) {
        setError(
          err.message.includes('fetch') ? 'No se pudo conectar con el servidor. ¿Está el backend arrancado?' : err.message
        );
      }
    } finally {
      if (sequence === searchSequenceRef.current) {
        setLoading(false);
        if (!deferredEnrichment) {
          if (!progressive) searchControllerRef.current = null;
          setEnriching(false);
        }
      }
    }
  }, [addHistory, progressive]);

  const loadSection = useCallback(async (type) => {
    const context = searchContextRef.current;
    const key = SEARCH_SECTIONS.find(([sectionType]) => sectionType === type)?.[1];
    if (!context || !key || context.sequence !== searchSequenceRef.current) return;
    if (sectionRequestsRef.current.has(type)) return sectionRequestsRef.current.get(type);
    const request = (async () => {
      try {
        const data = rankSearchResult(await api.search(context.query, type, context.controller.signal), context.query);
        if (context.sequence !== searchSequenceRef.current) return;
        void writeIndexedSearch(context.query, type, data);
        setResults((current) => current?.query !== context.query ? current : ({
          ...current, [key]: data.items || [],
          pending: current.pending?.filter((item) => item !== type),
        }));
      } catch (error) {
        if (context.sequence !== searchSequenceRef.current || error.name === 'AbortError') return;
        sectionRequestsRef.current.delete(type);
        throw error;
      }
    })();
    sectionRequestsRef.current.set(type, request);
    return request;
  }, []);

  const changeTab = (type) => {
    setSearchType(type);
    if (results?.query) runSearch(results.query, type);
    else setView({ kind: 'search' });
  };

  const openDetail = useCallback(async (kind, load) => {
    cancelSearch();
    const sequence = searchSequenceRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await load();
      if (sequence !== searchSequenceRef.current) return;
      setView({ kind, data });
      scrollAppToTop();
    } catch (err) {
      if (sequence === searchSequenceRef.current) setError(err.message);
    } finally {
      if (sequence === searchSequenceRef.current) setLoading(false);
    }
  }, [cancelSearch]);

  const openArtist = useCallback((id) => id && openDetail('artist', () => loadArtist(id)), [openDetail]);
  const openAlbum = useCallback((id) => id && openDetail('album', () => api.album(id)), [openDetail]);

  const showDownloads = () => {
    cancelSearch();
    setError('');
    setView({ kind: 'downloads' });
  };

  const goBack = showCatalog;

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
    loadSection,
    changeTab,
    openArtist,
    openAlbum,
    showDownloads,
    goBack,
  };
}
