// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import { useCallback, useEffect, useRef, useState } from 'react';
import { localAudioUrl, streamUrl } from '../lib/api.js';
import { readStorage, writeStorage } from '../lib/storage.js';

export const PLAY_EVENT = 'yotubei:play';
export const PAUSE_EVENT = 'yotubei:pause';

export function usePlayer({ isDownloaded, enabled = true, onPlayerVisibilityChange }) {
  const audioRef = useRef(null);
  const loadTimeoutRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readStorage('volume', 0.8));
  const [seeking, setSeeking] = useState(false);
  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const videoId = currentSong?.id;
  const isLocal = Boolean(currentSong && (currentSong.local || isDownloaded(currentSong.id)));

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current === null) return;
    window.clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = null;
  }, []);

  const playFrom = useCallback((list, index) => {
    if (!list || index < 0 || index >= list.length) return;
    setPlayerError('');
    setQueue(list);
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(list[index].durationSeconds || 0);
    setIsBuffering(true);
    onPlayerVisibilityChange?.(true);
  }, [onPlayerVisibilityChange]);

  const playShuffled = useCallback((list) => {
    if (!list?.length) return;
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playFrom(shuffled, 0);
  }, [playFrom]);

  const playNext = useCallback(() => {
    if (currentIndex < queue.length - 1) playFrom(queue, currentIndex + 1);
    else setIsPlaying(false);
  }, [currentIndex, queue, playFrom]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (audio.paused) audio.play().catch(() => setPlayerError('No se pudo iniciar la reproducción.'));
    else audio.pause();
  }, [currentSong]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if ((audio?.currentTime || 0) > 3) {
      audio.currentTime = 0;
      return;
    }
    if (currentIndex > 0) playFrom(queue, currentIndex - 1);
  }, [currentIndex, queue, playFrom]);

  const closePlayer = useCallback(() => {
    clearLoadTimeout();
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    setQueue([]);
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setPlayerError('');
    onPlayerVisibilityChange?.(false);
  }, [clearLoadTimeout, onPlayerVisibilityChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!videoId || !audio) return;
    audio.src = isLocal ? localAudioUrl(videoId) : streamUrl(videoId);
    audio.load();
    clearLoadTimeout();
    loadTimeoutRef.current = window.setTimeout(() => {
      loadTimeoutRef.current = null;
      audio.pause();
      setIsBuffering(false);
      setIsPlaying(false);
      setPlayerError('La canción tardó demasiado en cargar. Inténtalo de nuevo.');
    }, 20000);
    audio.play().catch((error) => {
      if (error.name === 'AbortError') return;
      clearLoadTimeout();
      setIsBuffering(false);
      setPlayerError('No se pudo reproducir esta canción.');
    });
    return clearLoadTimeout;
  }, [clearLoadTimeout, videoId, isLocal]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    writeStorage('volume', volume);
  }, [volume]);

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

  useEffect(() => {
    const pause = () => {
      audioRef.current?.pause();
    };
    window.addEventListener(PAUSE_EVENT, pause);
    return () => window.removeEventListener(PAUSE_EVENT, pause);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event) => {
      if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        const value = Math.max(0, currentTime + (event.code === 'ArrowRight' ? 5 : -5));
        if (audioRef.current) audioRef.current.currentTime = value;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, togglePlay, currentTime]);

  const handleSeek = (event) => { setCurrentTime(Number(event.target.value)); setSeeking(true); };
  const commitSeek = (event) => {
    const value = Number(event.target.value);
    if (audioRef.current) audioRef.current.currentTime = value;
    setSeeking(false);
  };
  const audioProps = {
    ref: audioRef,
    preload: 'auto',
    onPlay: () => { clearLoadTimeout(); setIsPlaying(true); setIsBuffering(false); window.dispatchEvent(new CustomEvent(PLAY_EVENT)); },
    onPause: () => setIsPlaying(false),
    onWaiting: () => setIsBuffering(true),
    onPlaying: () => { clearLoadTimeout(); setIsBuffering(false); },
    onCanPlay: () => { clearLoadTimeout(); setIsBuffering(false); },
    onLoadedMetadata: (event) => setDuration(event.currentTarget.duration),
    onTimeUpdate: (event) => { if (!seeking) setCurrentTime(event.currentTarget.currentTime); },
    onEnded: playNext,
    onError: () => { clearLoadTimeout(); setIsBuffering(false); setIsPlaying(false); setPlayerError('Error al cargar el audio. Prueba con otra canción.'); },
  };
  const progressMax = duration || currentSong?.durationSeconds || 0;
  return {
    audioProps, isLocal, currentSong, currentIndex, queue,
    hasNext: currentIndex < queue.length - 1,
    isPlaying, isBuffering, playerError, currentTime, progressMax,
    progressPct: progressMax ? (currentTime / progressMax) * 100 : 0,
    volume, setVolume, playFrom, playShuffled, togglePlay, playNext, playPrev, closePlayer,
    handleSeek, commitSeek,
  };
}
