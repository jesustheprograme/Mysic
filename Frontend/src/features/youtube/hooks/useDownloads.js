// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/hooks/useDownloads.js
// Descargas para escuchar sin conexión: lista, trabajos en curso (sondeo),
// estado de conexión del navegador y acciones.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const POLL_MS = 1200;

export function useDownloads() {
  const [downloads, setDownloads] = useState({ items: [], jobs: {} });
  const [online, setOnline] = useState(() => navigator.onLine);

  const downloadedIds = new Set(downloads.items.map((item) => item.id));
  const downloadedIdsRef = useRef(downloadedIds);
  useEffect(() => {
    downloadedIdsRef.current = downloadedIds;
  });
  const activeJobs = Object.values(downloads.jobs).filter((job) => job.status === 'downloading').length;

  const refresh = useCallback(async () => {
    try {
      const data = await api.downloads.list();
      setDownloads({ items: data.items || [], jobs: data.jobs || {} });
    } catch (err) {
      console.error('No se pudieron cargar las descargas:', err);
    }
  }, []);

  // Carga inicial (y cuando cambia el número de descargas en curso) más sondeo mientras haya alguna
  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const timer = activeJobs > 0 ? setInterval(refresh, POLL_MS) : null;
    return () => {
      clearTimeout(initial);
      if (timer) clearInterval(timer);
    };
  }, [activeJobs, refresh]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const downloadSong = useCallback(
    async (song) => {
      if (!song?.id) return;
      // Marcamos el trabajo al instante para que el botón reaccione sin esperar al sondeo
      setDownloads((prev) => ({
        ...prev,
        jobs: { ...prev.jobs, [song.id]: { status: 'downloading', progress: 0 } },
      }));
      try {
        await api.downloads.add(song);
      } catch (err) {
        console.error('No se pudo iniciar la descarga:', err);
      }
      refresh();
    },
    [refresh]
  );

  const downloadMany = useCallback(
    (songs) => {
      songs.filter((s) => s.id && !downloadedIdsRef.current.has(s.id)).forEach((s) => downloadSong(s));
    },
    [downloadSong]
  );

  const deleteDownload = useCallback(
    async (id) => {
      try {
        await api.downloads.remove(id);
      } catch (err) {
        console.error('No se pudo borrar la descarga:', err);
      }
      refresh();
    },
    [refresh]
  );

  const isDownloaded = useCallback((id) => downloadedIdsRef.current.has(id), []);

  return {
    downloads,
    downloadedIds,
    activeJobs,
    online,
    isDownloaded,
    downloadSong,
    downloadMany,
    deleteDownload,
  };
}
