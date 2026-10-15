// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/hooks/usePlayer.js
// Estado y control del reproductor: cola, elemento <audio>, volumen,
// Media Session (teclas multimedia) y atajos de teclado.
//
// Integración con otra app (p. ej. Mysic, que tiene su propio reproductor):
//  - Al empezar a sonar se emite `window` → 'yotubei:play' (la app anfitriona pausa el suyo).
//  - Si la app anfitriona emite 'yotubei:pause', este reproductor se pausa.
//  - Con `enabled: false` (sección oculta) los atajos de teclado no actúan.
import { useCallback, useEffect, useRef, useState } from 'react';
import { localAudioUrl, streamUrl } from '../lib/api.js';
import { readStorage, writeStorage } from '../lib/storage.js';

export const PLAY_EVENT = 'yotubei:play';
export const PAUSE_EVENT = 'yotubei:pause';

/**
 * @param {{ isDownloaded: (id: string) => boolean, enabled?: boolean }} options
 *   isDownloaded decide si una canción se reproduce desde el disco (sin internet).
 *   enabled = false desactiva los atajos de teclado (la vista está oculta).
 */
export function usePlayer({ isDownloaded, enabled = true }) {
  const audioRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readStorage('volume', 0.8));
  const [seeking, setSeeking] = useState(false);

  // Copia accesible desde el efecto de carga sin añadirla a sus dependencias
  const isDownloadedRef = useRef(isDownloaded);
  useEffect(() => {
    isDownloadedRef.current = isDownloaded;
  });

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  /** Reproduce la canción `index` de `list`, que pasa a ser la cola. */
  const playFrom = useCallback((list, index) => {
    if (!list || index < 0 || index >= list.length) return;
    setPlayerError('');
    setQueue(list);
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(list[index].durationSeconds || 0);
    setIsPlaying(true);
  }, []);

  /** Reproduce la lista en orden aleatorio. */
  const playShuffled = useCallback(
    (list) => {
      if (!list || list.length === 0) return;
      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      playFrom(shuffled, 0);
    },
    [playFrom]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        console.error('No se pudo reproducir:', err);
        setPlayerError('No se pudo iniciar la reproducción.');
      });
    } else {
      audio.pause();
    }
  }, [currentSong]);

  const playNext = useCallback(() => {
    if (currentIndex < queue.length - 1) playFrom(queue, currentIndex + 1);
    else setIsPlaying(false);
  }, [currentIndex, queue, playFrom]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    // Si llevamos más de 3 segundos, "anterior" reinicia la canción actual
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (currentIndex > 0) playFrom(queue, currentIndex - 1);
  }, [currentIndex, queue, playFrom]);

  // Cargar y reproducir cuando cambia la canción
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    const isLocal = currentSong.local || isDownloadedRef.current(currentSong.id);
    audio.src = isLocal ? localAudioUrl(currentSong.id) : streamUrl(currentSong.id);
    audio.load();
    setIsBuffering(true);
    audio.play().catch((err) => {
      // AbortError ocurre al cambiar rápido de canción; no es un error real
      if (err.name !== 'AbortError') {
        console.error('Error de reproducción:', err);
        setPlayerError('No se pudo reproducir esta canción.');
        setIsBuffering(false);
      }
    });
  }, [currentSong]);

  // Volumen: aplicar y recordar
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    writeStorage('volume', volume);
  }, [volume]);

  // Media Session: controles en la pantalla de bloqueo / teclas multimedia
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: currentSong.thumbnail ? [{ src: currentSong.thumbnail }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }, [currentSong, playPrev, playNext]);

  // La app anfitriona puede pedir que este reproductor se pause
  useEffect(() => {
    const pause = () => audioRef.current?.pause();
    window.addEventListener(PAUSE_EVENT, pause);
    return () => window.removeEventListener(PAUSE_EVENT, pause);
  }, []);

  // Atajos: espacio = play/pausa, flechas = ±5 s (solo con la vista visible)
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      const audio = audioRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' && audio) {
        audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || 0);
      } else if (e.code === 'ArrowLeft' && audio) {
        audio.currentTime = Math.max(audio.currentTime - 5, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, enabled]);

  const handleSeek = (e) => {
    setCurrentTime(Number(e.target.value));
    if (!seeking) setSeeking(true);
  };

  const commitSeek = (e) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Number(e.target.value);
    setSeeking(false);
  };

  // Manejadores del elemento <audio>
  const audioProps = {
    ref: audioRef,
    preload: 'auto',
    onPlay: () => {
      setIsPlaying(true);
      window.dispatchEvent(new CustomEvent(PLAY_EVENT));
    },
    onPause: () => setIsPlaying(false),
    onWaiting: () => setIsBuffering(true),
    onPlaying: () => setIsBuffering(false),
    onCanPlay: () => setIsBuffering(false),
    onLoadedMetadata: (e) => setDuration(e.currentTarget.duration),
    onDurationChange: (e) => {
      if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
    },
    onTimeUpdate: (e) => {
      if (!seeking) setCurrentTime(e.currentTarget.currentTime);
    },
    onEnded: playNext,
    onError: () => {
      setIsBuffering(false);
      setIsPlaying(false);
      setPlayerError('Error al cargar el audio. Prueba con otra canción.');
    },
  };

  const progressMax = duration || currentSong?.durationSeconds || 0;

  return {
    audioProps,
    currentSong,
    hasNext: currentIndex < queue.length - 1,
    isPlaying,
    isBuffering,
    playerError,
    currentTime,
    progressMax,
    progressPct: progressMax ? (currentTime / progressMax) * 100 : 0,
    volume,
    setVolume,
    playFrom,
    playShuffled,
    togglePlay,
    playNext,
    playPrev,
    handleSeek,
    commitSeek,
  };
}
