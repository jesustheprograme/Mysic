// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import { useCallback, useEffect, useRef, useState } from 'react';
import { localAudioUrl } from '../lib/api.js';
import { readStorage, writeStorage } from '../lib/storage.js';

export const PLAY_EVENT = 'yotubei:play';
export const PAUSE_EVENT = 'yotubei:pause';

let iframeApiPromise;

function loadIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('No se pudo cargar el reproductor de YouTube.'));
      document.head.appendChild(script);
    }
  });
  return iframeApiPromise;
}

export function usePlayer({ isDownloaded, enabled = true }) {
  const audioRef = useRef(null);
  const iframeHostRef = useRef(null);
  const youtubeRef = useRef(null);
  const youtubeReadyRef = useRef(false);
  const pendingVideoIdRef = useRef(null);
  const nextRef = useRef(() => {});
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
  const volumeRef = useRef(volume);

  const playFrom = useCallback((list, index) => {
    if (!list || index < 0 || index >= list.length) return;
    setPlayerError('');
    setQueue(list);
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(list[index].durationSeconds || 0);
    setIsBuffering(true);
  }, []);

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
  useEffect(() => {
    nextRef.current = playNext;
  }, [playNext]);

  const togglePlay = useCallback(() => {
    if (!currentSong) return;
    if (isLocal) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => setPlayerError('No se pudo iniciar la reproducción.'));
      else audio.pause();
      return;
    }
    const player = youtubeRef.current;
    if (!player) return;
    if (player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) player.pauseVideo();
    else player.playVideo();
  }, [currentSong, isLocal]);

  const playPrev = useCallback(() => {
    const position = isLocal ? audioRef.current?.currentTime : youtubeRef.current?.getCurrentTime?.();
    if ((position || 0) > 3) {
      if (isLocal && audioRef.current) audioRef.current.currentTime = 0;
      else youtubeRef.current?.seekTo?.(0, true);
      return;
    }
    if (currentIndex > 0) playFrom(queue, currentIndex - 1);
  }, [currentIndex, queue, playFrom, isLocal]);

  useEffect(() => {
    if (!videoId || isLocal) return undefined;
    let cancelled = false;
    setPlayerError('');
    setIsBuffering(true);
    loadIframeApi().then((YT) => {
      if (cancelled || !iframeHostRef.current) return;
      if (!youtubeRef.current?.loadVideoById) {
        pendingVideoIdRef.current = videoId;
        youtubeRef.current = new YT.Player(iframeHostRef.current, {
          width: 320,
          height: 200,
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0 },
          events: {
            onReady: (event) => {
              youtubeReadyRef.current = true;
              event.target.setVolume(Math.round(volumeRef.current * 100));
              const requestedVideoId = pendingVideoIdRef.current;
              pendingVideoIdRef.current = null;
              if (requestedVideoId && requestedVideoId !== videoId) event.target.loadVideoById(requestedVideoId);
              else event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                setIsBuffering(false);
                window.dispatchEvent(new CustomEvent(PLAY_EVENT));
              } else if (event.data === YT.PlayerState.BUFFERING) setIsBuffering(true);
              else if (event.data === YT.PlayerState.ENDED) nextRef.current();
              else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED) {
                setIsPlaying(false);
                setIsBuffering(false);
              }
            },
            onError: () => {
              setIsPlaying(false);
              setIsBuffering(false);
              setPlayerError('YouTube no permite reproducir esta canción incrustada.');
            },
          },
        });
      } else if (youtubeReadyRef.current) youtubeRef.current.loadVideoById(videoId);
      else pendingVideoIdRef.current = videoId;
    }).catch((error) => {
      setIsBuffering(false);
      setPlayerError(error.message);
    });
    return () => { cancelled = true; };
  }, [videoId, isLocal]);

  useEffect(() => () => {
    youtubeRef.current?.destroy?.();
    youtubeRef.current = null;
    youtubeReadyRef.current = false;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!videoId || !isLocal || !audio) return;
    youtubeRef.current?.pauseVideo?.();
    audio.src = localAudioUrl(videoId);
    audio.load();
    audio.play().catch(() => setPlayerError('No se pudo reproducir el archivo descargado.'));
  }, [videoId, isLocal]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
    youtubeRef.current?.setVolume?.(Math.round(volume * 100));
    writeStorage('volume', volume);
  }, [volume]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!youtubeRef.current || isLocal || seeking) return;
      const nextTime = youtubeRef.current.getCurrentTime?.();
      const nextDuration = youtubeRef.current.getDuration?.();
      if (Number.isFinite(nextTime)) setCurrentTime(nextTime);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
    }, 500);
    return () => clearInterval(timer);
  }, [isLocal, seeking]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: currentSong.thumbnail ? [{ src: currentSong.thumbnail }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => isLocal ? audioRef.current?.play() : youtubeRef.current?.playVideo?.());
    navigator.mediaSession.setActionHandler('pause', () => isLocal ? audioRef.current?.pause() : youtubeRef.current?.pauseVideo?.());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }, [currentSong, isLocal, playPrev, playNext]);

  useEffect(() => {
    const pause = () => {
      audioRef.current?.pause();
      youtubeRef.current?.pauseVideo?.();
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
        if (isLocal && audioRef.current) audioRef.current.currentTime = value;
        else youtubeRef.current?.seekTo?.(value, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, togglePlay, currentTime, isLocal]);

  const handleSeek = (event) => { setCurrentTime(Number(event.target.value)); setSeeking(true); };
  const commitSeek = (event) => {
    const value = Number(event.target.value);
    if (isLocal && audioRef.current) audioRef.current.currentTime = value;
    else youtubeRef.current?.seekTo?.(value, true);
    setSeeking(false);
  };
  const audioProps = {
    ref: audioRef,
    preload: 'auto',
    onPlay: () => { setIsPlaying(true); setIsBuffering(false); window.dispatchEvent(new CustomEvent(PLAY_EVENT)); },
    onPause: () => setIsPlaying(false),
    onWaiting: () => setIsBuffering(true),
    onPlaying: () => setIsBuffering(false),
    onLoadedMetadata: (event) => setDuration(event.currentTarget.duration),
    onTimeUpdate: (event) => { if (!seeking) setCurrentTime(event.currentTarget.currentTime); },
    onEnded: playNext,
    onError: () => { setIsBuffering(false); setIsPlaying(false); setPlayerError('Error al cargar el audio descargado.'); },
  };
  const progressMax = duration || currentSong?.durationSeconds || 0;
  return {
    audioProps, iframeHostRef, isLocal, currentSong,
    hasNext: currentIndex < queue.length - 1,
    isPlaying, isBuffering, playerError, currentTime, progressMax,
    progressPct: progressMax ? (currentTime / progressMax) * 100 : 0,
    volume, setVolume, playFrom, playShuffled, togglePlay, playNext, playPrev,
    handleSeek, commitSeek,
  };
}
