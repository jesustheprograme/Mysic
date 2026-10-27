// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// Búsqueda y navegación entre vistas: resultados, artista, álbum y descargas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { readIndexedSearch, writeIndexedSearch } from '../lib/searchIndex.js';
import { rankSearchResult } from '../lib/searchRanking.js';
import { readStorage, writeStorage } from '../lib/storage.js';
import { useSearchHistory } from './useSearchHistory.js';

const BROWSE_STORAGE_KEY = 'mysic:youtube:browse-view';

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

function scheduleBackground(callback) {
  return scheduleWhenIdle(callback);
}

async function loadArtist(id, signal) {
  return api.artist(id, signal);
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
  const [view, setView] = useState({ kind: 'home', data: null });
  const { history, add: addHistory, remove: removeFromHistory } = useSearchHistory();
  const searchControllerRef = useRef(null);
  const detailControllerRef = useRef(null);
  const artistEnrichmentControllerRef = useRef(null);
  const artistEnrichmentCancelRef = useRef(null);
  const enrichmentCancelRef = useRef(null);
  const searchSequenceRef = useRef(0);
  const sectionRequestsRef = useRef(new Map());
  const searchContextRef = useRef(null);
  const resultsRef = useRef(results);
  const viewRef = useRef(view);
  const viewHistoryRef = useRef([]);
  const savedViewRef = useRef(readStorage(BROWSE_STORAGE_KEY, { kind: 'home' }));
  const restoringViewRef = useRef(true);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const cancelRequests = useCallback(() => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    detailControllerRef.current?.abort();
    detailControllerRef.current = null;
    artistEnrichmentControllerRef.current?.abort();
    artistEnrichmentControllerRef.current = null;
    artistEnrichmentCancelRef.current?.();
    artistEnrichmentCancelRef.current = null;
    enrichmentCancelRef.current?.();
    enrichmentCancelRef.current = null;
    setLoading(false);
    setEnriching(false);
  }, []);

  useEffect(() => () => {
    searchSequenceRef.current += 1;
    searchControllerRef.current?.abort();
    detailControllerRef.current?.abort();
    artistEnrichmentControllerRef.current?.abort();
    artistEnrichmentCancelRef.current?.();
    enrichmentCancelRef.current?.();
  }, []);

  useEffect(() => {
    const artistId = view.kind === 'artist' ? view.data?.id : null;
    if (!artistId || (view.data?.releasesComplete && view.data?.songDetailsComplete)) return undefined;

    const controller = new AbortController();
    artistEnrichmentControllerRef.current?.abort();
    artistEnrichmentControllerRef.current = controller;
    artistEnrichmentCancelRef.current?.();
    artistEnrichmentCancelRef.current = scheduleBackground(async () => {
      artistEnrichmentCancelRef.current = null;
      try {
        const [releases, songDetails] = await Promise.allSettled([
          api.artistReleases(artistId, controller.signal),
          api.artistTopSongs(artistId, controller.signal),
        ]);
        setView((current) => current.kind === 'artist' && current.data?.id === artistId
          ? {
              ...current,
              data: {
                ...current.data,
                shelves: releases.status === 'fulfilled' ? releases.value.shelves : current.data.shelves,
                releasesComplete: true,
                topSongs: songDetails.status === 'fulfilled'
                  ? current.data.topSongs.map((song) => {
                      const details = songDetails.value.songs.find((item) => item.id === song.id);
                      return details ? { ...song, duration: details.duration, durationSeconds: details.durationSeconds } : song;
                    })
                  : current.data.topSongs,
                songDetailsComplete: true,
              },
            }
          : current);
      } catch (error) {
        if (error.name !== 'AbortError') console.warn(`No se pudo completar la discografía: ${error.message}`);
      } finally {
        if (artistEnrichmentControllerRef.current === controller) {
          artistEnrichmentControllerRef.current = null;
        }
      }
    });

    return () => {
      controller.abort();
      artistEnrichmentCancelRef.current?.();
      artistEnrichmentCancelRef.current = null;
    };
  }, [view.data?.id, view.data?.releasesComplete, view.data?.songDetailsComplete, view.kind]);

  const runSearch = useCallback(async (text, type) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    detailControllerRef.current?.abort();
    detailControllerRef.current = null;
    viewHistoryRef.current = [];
    const current = searchContextRef.current;
    const repeatsCurrentSearch = current?.type === type
      && current.query.toLocaleLowerCase() === trimmed.toLocaleLowerCase()
      && current.sequence === searchSequenceRef.current
      && !current.controller.signal.aborted;
    if (repeatsCurrentSearch && current.pending) return;
    if (repeatsCurrentSearch && hasResults(resultsRef.current)) {
      setQuery(trimmed);
      setError('');
      setView({ kind: 'search' });
      addHistory(trimmed);
      return;
    }

    searchControllerRef.current?.abort();
    enrichmentCancelRef.current?.();
    enrichmentCancelRef.current = null;
    const controller = new AbortController();
    const sequence = ++searchSequenceRef.current;
    searchControllerRef.current = controller;
    setQuery(trimmed);
    sectionRequestsRef.current.clear();
    searchContextRef.current = { query: trimmed, type, sequence, controller, pending: true };
    setResults(progressive && type === 'all'
      ? { type: 'all', query: trimmed, songs: null, artists: [], albums: [], pending: ['artist', 'album'] }
      : null);
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
        readIndexedSearch(trimmed, type, { exactOnly: true }),
        new Promise((resolve) => setTimeout(() => resolve(null), 80)),
      ]), trimmed);

      if (sequence !== searchSequenceRef.current) return;
      if (hasResults(indexed)) {
        indexedResultsShown = true;
        setResults({ ...indexed, query: trimmed });
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
      const isCurrentSearch = sequence === searchSequenceRef.current;
      if (isCurrentSearch) searchContextRef.current.pending = false;
      setLoading((current) => isCurrentSearch ? false : current);
      if (isCurrentSearch && !deferredEnrichment) {
        if (!progressive) searchControllerRef.current = null;
        setEnriching(false);
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

  const prefetchSearch = useCallback((text) => {
    api.warmSearch(text, 'song');
  }, []);

  const runGlobalSearch = useCallback((text) => {
    setSearchType('all');
    return runSearch(text, 'all');
  }, [runSearch]);

  const changeTab = (type) => {
    setSearchType(type);
    if (results?.query) runSearch(results.query, type);
    else setView({ kind: 'search' });
  };

  const openDetail = useCallback(async (kind, load, rememberCurrent = true) => {
    cancelRequests();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const sequence = searchSequenceRef.current;
    if (rememberCurrent && viewHistoryRef.current.at(-1) !== viewRef.current) {
      viewHistoryRef.current.push(viewRef.current);
    }
    setLoading(true);
    setError('');
    try {
      const data = await load(controller.signal);
      if (sequence !== searchSequenceRef.current) return;
      setView({ kind, data });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (sequence === searchSequenceRef.current) setError(err.message);
    } finally {
      if (detailControllerRef.current === controller) detailControllerRef.current = null;
      setLoading((current) => sequence === searchSequenceRef.current ? false : current);
    }
  }, [cancelRequests]);

  const openLanding = useCallback((kind, load) => {
    viewHistoryRef.current = [];
    setView({ kind, data: null });
    return openDetail(kind, load, false);
  }, [openDetail]);
  const showHome = useCallback(() => openLanding('home', (signal) => api.home(signal)), [openLanding]);
  const showExplore = useCallback(() => openLanding('explore', (signal) => api.explore(signal)), [openLanding]);
  const showRecommendations = useCallback((id) => (
    id && openLanding('recommendations', (signal) => api.recommendations(id, signal))
  ), [openLanding]);

  const openArtist = useCallback((id) => {
    if (!id || (viewRef.current.kind === 'artist' && viewRef.current.data?.id === id)) return;
    return openDetail('artist', (signal) => loadArtist(id, signal));
  }, [openDetail]);
  const openArtistSongs = useCallback((id) => id && openDetail('artist-songs', (signal) => api.artistSongs(id, signal)), [openDetail]);
  const openAlbum = useCallback((id) => id && openDetail('album', (signal) => api.album(id, signal)), [openDetail]);

  const showDownloads = () => {
    cancelRequests();
    if (viewHistoryRef.current.at(-1) !== viewRef.current) viewHistoryRef.current.push(viewRef.current);
    setError('');
    setView({ kind: 'downloads' });
  };

  useEffect(() => {
    if (restoringViewRef.current) return;

    let savedView = null;
    if (['home', 'explore', 'downloads'].includes(view.kind)) {
      savedView = { kind: view.kind };
    } else if (['artist', 'artist-songs', 'album'].includes(view.kind) && view.data?.id) {
      savedView = { kind: view.kind, id: view.data.id };
    } else if (view.kind === 'search' && (results?.query || query.trim())) {
      savedView = { kind: 'search', query: results?.query || query.trim(), type: searchType };
    }

    if (savedView) writeStorage(BROWSE_STORAGE_KEY, savedView);
  }, [query, results?.query, searchType, view.data?.id, view.kind]);

  useEffect(() => {
    const savedView = savedViewRef.current;
    let restoreRequest;

    if (savedView?.kind === 'artist' && savedView.id) restoreRequest = openArtist(savedView.id);
    else if (savedView?.kind === 'artist-songs' && savedView.id) restoreRequest = openArtistSongs(savedView.id);
    else if (savedView?.kind === 'album' && savedView.id) restoreRequest = openAlbum(savedView.id);
    else if (savedView?.kind === 'explore') restoreRequest = showExplore();
    else if (savedView?.kind === 'search' && savedView.query) {
      const type = SEARCH_TABS.some((tab) => tab.type === savedView.type) ? savedView.type : 'all';
      setSearchType(type);
      restoreRequest = runSearch(savedView.query, type);
    } else if (savedView?.kind === 'downloads') {
      setView({ kind: 'downloads' });
    } else restoreRequest = showHome();

    Promise.resolve(restoreRequest).finally(() => {
      restoringViewRef.current = false;
    });
  }, [openAlbum, openArtist, openArtistSongs, runSearch, showExplore, showHome]);

  useEffect(() => {
    globalThis.addEventListener?.('mysic:global-home', showHome);
    return () => globalThis.removeEventListener?.('mysic:global-home', showHome);
  }, [showHome]);

  const goBack = useCallback(() => {
    const previous = viewHistoryRef.current.pop();
    if (!previous) {
      showHome();
      return;
    }
    cancelRequests();
    if (previous.kind === 'search' && searchContextRef.current) {
      const controller = new AbortController();
      searchControllerRef.current = controller;
      searchContextRef.current = {
        ...searchContextRef.current,
        controller,
        pending: false,
        sequence: searchSequenceRef.current,
      };
    }
    setError('');
    setView(previous);
  }, [cancelRequests, showHome]);

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
    addToHistory: addHistory,
    removeFromHistory,
    runSearch,
    runGlobalSearch,
    prefetchSearch,
    loadSection,
    changeTab,
    openArtist,
    openArtistSongs,
    openAlbum,
    showHome,
    showExplore,
    showRecommendations,
    showDownloads,
    goBack,
  };
}
