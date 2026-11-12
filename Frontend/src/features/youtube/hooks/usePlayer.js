// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import { useCallback, useEffect, useRef, useState } from 'react';
import { localAudioUrl, streamUrl, warmStream } from '../lib/api.js';
// Audio resuelto en el equipo del usuario (src-tauri/src/resolver.rs); el servidor queda de respaldo.
import { directAudioAvailable, directAudioUrl, forgetDirect, initDirectAudio, isDirectBlocked, warmDirect } from '../directAudio.js';
import { readStorage, writeStorage } from '../lib/storage.js';
// La cola, el respaldo de stream y el ciclo de vida del iframe son integraciones propias de Mysic.
import { insertIntoQueue } from '../queueOps.js';
import { HOVER_WARM_DELAY_MS, clampSeek, engineReleaseDelay, isCurrentStreamSource, isSupersededPlay, resumePosition, shouldCreateEngine, shouldUseDirectAudio } from '../playerEngine.js';
import { perfMark } from '../perfMarks.js';

export const PLAY_EVENT = 'yotubei:play';
export const PAUSE_EVENT = 'yotubei:pause';
const PLAYER_STORAGE_KEY = 'mysic:youtube:player-song';
const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

let iframeApiPromise;

// Prepara una pista: en la app de escritorio la resuelve el propio equipo (~80 ms); si no, el servidor.
const warmAny = (id) => (directAudioAvailable() && !isDirectBlocked(id) ? warmDirect(id) : warmStream(id));

function loadIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${IFRAME_API_URL}"]`)) {
      const script = document.createElement('script');
      script.src = IFRAME_API_URL;
      script.async = true;
      script.onerror = () => {
        // Sin red al pedir play: se olvida el intento para que el siguiente lo repita.
        iframeApiPromise = undefined;
        script.remove();
        reject(new Error('No se pudo cargar el reproductor de YouTube.'));
      };
      document.head.appendChild(script);
    }
  });
  return iframeApiPromise;
}
// Solo calienta la conexión: iframe_api y el iframe (un proceso aparte) esperan al primer play.
export function preloadYoutubePlayer() {
  if (typeof document !== 'undefined' && !window.YT?.Player && !document.querySelector('link[data-yt-preconnect]')) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://www.youtube.com';
    link.dataset.ytPreconnect = '';
    document.head.appendChild(link);
  }
  return Promise.resolve();
}

export function usePlayer({ isDownloaded, enabled = true, onQueueEnd, onQueueStart }) {
  const [restoredSong] = useState(() => readStorage(PLAYER_STORAGE_KEY, null));
  const restoringPausedSongRef = useRef(Boolean(restoredSong?.id));
  // Una canción restaurada se muestra sin motor: el iframe se crea al primer play o salto.
  const [engineArmed, setEngineArmed] = useState(() => !restoredSong?.id);
  // Lo mismo para <audio>: una canción restaurada en pausa no pide su stream hasta el primer play o salto.
  const [audioArmed, setAudioArmed] = useState(() => !restoredSong?.id);
  const hoverWarmRef = useRef(0);
  // Posición pedida sin motor (o guardada al liberarlo); se aplica al crearlo.
  const pendingStartRef = useRef(0);
  const audioRef = useRef(null);
  const iframeHostRef = useRef(null);
  const youtubeRef = useRef(null);
  const youtubeCreatingRef = useRef(false);
  const youtubeCreatedRef = useRef(null);
  const youtubeReadyRef = useRef(false);
  const pendingVideoIdRef = useRef(null);
  const nextRef = useRef(() => {});
  const queueBoundaryRef = useRef({ onQueueEnd, onQueueStart });
  const [queue, setQueue] = useState(() => restoredSong?.id ? [restoredSong] : []);
  const [currentIndex, setCurrentIndex] = useState(() => restoredSong?.id ? 0 : -1);
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
  // El stream directo evita el arranque lento del iframe. Si una pista concreta falla, solo esa
  // pista cae al iframe durante esta sesión.
  const [streamFailedIds, setStreamFailedIds] = useState([]);
  // Pistas cuya fuente directa falló: esas pasan al servidor (y solo si este también falla, al iframe).
  const [directFailedIds, setDirectFailedIds] = useState([]);
  const directRef = useRef(false);
  const isStreamed = shouldUseDirectAudio({
    videoId,
    isLocal,
    streamFailed: Boolean(videoId && streamFailedIds.includes(videoId)),
  });
  const usesAudio = isLocal || isStreamed;
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const streamedRef = useRef(false);
  streamedRef.current = isStreamed;
  const usesAudioRef = useRef(usesAudio);
  usesAudioRef.current = usesAudio;
  const volumeRef = useRef(volume);
  const progressMax = duration || currentSong?.durationSeconds || 0;
  const engineNeeded = shouldCreateEngine({ videoId, usesAudio, armed: engineArmed });
  const releaseDelay = engineReleaseDelay({ hasSong: Boolean(videoId), usesAudio, isPlaying, isBuffering });
  const nextSong = currentIndex >= 0 && queue.length > 1
    ? queue[(currentIndex + 1) % queue.length]
    : null;
  const nextSongId = nextSong?.id ?? null;
  const nextSongIsLocal = Boolean(nextSong && (nextSong.local || isDownloaded(nextSong.id)));
  // iframe_api solo se adelanta con una sesión activa: una cola restaurada en pausa no descarga nada.
  const nextSongNeedsEngine = Boolean(nextSongId && !nextSongIsLocal && isPlaying);

  useEffect(() => {
    void initDirectAudio();
  }, []);

  useEffect(() => {
    queueBoundaryRef.current = { onQueueEnd, onQueueStart };
  }, [onQueueEnd, onQueueStart]);

  const warmNow = useCallback((song) => {
    const id = typeof song === 'string' ? song : song?.id;
    if (!id || (typeof song === 'object' && song?.local) || isDownloaded(id)) return;
    warmAny(id).then(() => perfMark('stream-resolved', { id })).catch(() => {});
  }, [isDownloaded]);
  // Al pasar el cursor: solo se prepara la última fila en la que el puntero se detiene. Recorrer una lista
  // con el ratón no lanza una resolución por fila (cada una es una consulta completa a YouTube).
  const warmSong = useCallback((song) => {
    clearTimeout(hoverWarmRef.current);
    hoverWarmRef.current = setTimeout(() => warmNow(song), HOVER_WARM_DELAY_MS);
  }, [warmNow]);
  useEffect(() => () => clearTimeout(hoverWarmRef.current), []);

  const playFrom = useCallback((list, index) => {
    if (!list || index < 0 || index >= list.length) return;
    perfMark('playback-intent', { id: list[index]?.id });
    clearTimeout(hoverWarmRef.current);
    warmNow(list[index]);
    if (list[index + 1]) warmNow(list[index + 1]);
    restoringPausedSongRef.current = false;
    pendingStartRef.current = 0;
    setEngineArmed(true);
    setAudioArmed(true);
    setPlayerError('');
    setQueue(list);
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(list[index].durationSeconds || 0);
    setIsBuffering(true);
  }, [warmNow]);

  // Primera intención de reproducir la canción actual sin motor: lo crea (con autoplay).
  const wakeEngine = useCallback(() => {
    restoringPausedSongRef.current = false;
    pendingVideoIdRef.current = videoIdRef.current ?? null;
    setPlayerError('');
    setEngineArmed(true);
    setIsBuffering(true);
  }, []);

  const releaseEngine = useCallback(() => {
    youtubeCreatedRef.current?.destroy?.();
    iframeHostRef.current?.replaceChildren();
    youtubeCreatedRef.current = null;
    youtubeRef.current = null;
    youtubeReadyRef.current = false;
    youtubeCreatingRef.current = false;
  }, []);

  // Inserta canciones en la cola sin reiniciar la actual.
  const enqueue = useCallback((songs, options) => {
    const result = insertIntoQueue(queue, currentIndex, songs, options);
    if (result.queue === queue) return;
    setQueue(result.queue);
    setCurrentIndex(result.index);
  }, [queue, currentIndex]);

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
    else {
      setIsPlaying(false);
      queueBoundaryRef.current.onQueueEnd?.();
    }
  }, [currentIndex, queue, playFrom]);
  useEffect(() => {
    nextRef.current = playNext;
  }, [playNext]);

  const togglePlay = useCallback(() => {
    if (!currentSong) return;
    restoringPausedSongRef.current = false;
    if (usesAudio) {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audioArmed) {
        // Canción restaurada: el primer play carga la fuente (el efecto de <audio> la reproduce).
        setPlayerError('');
        setIsBuffering(true);
        setAudioArmed(true);
        return;
      }
      if (audio.paused) audio.play().catch(() => setPlayerError('No se pudo iniciar la reproducción.'));
      else audio.pause();
      return;
    }
    const player = youtubeRef.current;
    if (!player?.playVideo || !player?.pauseVideo) {
      // Sin motor (restaurada o liberado) o creándose: un segundo clic no lo crea dos veces.
      wakeEngine();
      return;
    }
    if (player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) player.pauseVideo();
    else player.playVideo();
  }, [audioArmed, currentSong, usesAudio, wakeEngine]);

  const playPrev = useCallback(() => {
    const position = usesAudio
      ? audioRef.current?.currentTime
      : youtubeRef.current?.getCurrentTime?.() ?? pendingStartRef.current;
    if ((position || 0) > 3) {
      if (usesAudio && audioRef.current) audioRef.current.currentTime = 0;
      else if (youtubeRef.current?.seekTo) youtubeRef.current.seekTo(0, true);
      else {
        pendingStartRef.current = 0;
        setCurrentTime(0);
      }
      return;
    }
    if (currentIndex > 0) playFrom(queue, currentIndex - 1);
    else queueBoundaryRef.current.onQueueStart?.();
  }, [currentIndex, queue, playFrom, usesAudio]);

  const closePlayer = useCallback(() => {
    audioRef.current?.pause();
    youtubeRef.current?.pauseVideo?.();
    pendingVideoIdRef.current = null;
    pendingStartRef.current = 0;
    setQueue([]);
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setPlayerError('');
  }, []);

  useEffect(() => {
    writeStorage(PLAYER_STORAGE_KEY, currentSong?.id ? currentSong : null);
    if (currentSong?.id) perfMark('track-rendered', { id: currentSong.id });
  }, [currentSong]);

  useEffect(() => {
    if (!nextSongId) return undefined;
    if (!nextSongIsLocal) {
      if (streamFailedIds.includes(nextSongId)) {
        if (nextSongNeedsEngine) loadIframeApi().catch(() => {});
      } else warmAny(nextSongId).catch(() => {});
      return undefined;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = localAudioUrl(nextSongId);
    audio.load();
    return () => {
      audio.removeAttribute('src');
      audio.load();
    };
  }, [nextSongId, nextSongIsLocal, nextSongNeedsEngine, streamFailedIds]);

  useEffect(() => {
    if (!engineNeeded) return undefined;
    let cancelled = false;
    loadIframeApi().then((YT) => {
      if (cancelled || !iframeHostRef.current) return;
      pendingVideoIdRef.current = videoId;
      if (youtubeRef.current?.loadVideoById && youtubeReadyRef.current) {
        const startSeconds = pendingStartRef.current;
        pendingStartRef.current = 0;
        youtubeRef.current.loadVideoById(startSeconds > 0 ? { videoId, startSeconds } : videoId);
      } else if (!youtubeCreatingRef.current) {
        youtubeCreatingRef.current = true;
        const createdStart = Math.floor(pendingStartRef.current);
        const iframeMount = document.createElement('div');
        iframeHostRef.current.replaceChildren(iframeMount);
        youtubeCreatedRef.current = new YT.Player(iframeMount, {
          width: 320,
          height: 200,
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            enablejsapi: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
            ...(createdStart > 0 ? { start: createdStart } : {}),
          },
          events: {
            onReady: (event) => {
              youtubeRef.current = event.target;
              youtubeReadyRef.current = true;
              youtubeCreatingRef.current = false;
              event.target.setVolume(Math.round(volumeRef.current * 100));
              const requestedVideoId = pendingVideoIdRef.current;
              pendingVideoIdRef.current = null;
              const startSeconds = pendingStartRef.current;
              pendingStartRef.current = 0;
              // Mientras se creaba se cerró el reproductor o la canción pasó a <audio>: no debe sonar.
              if (!videoIdRef.current || usesAudioRef.current) {
                event.target.stopVideo?.();
                return;
              }
              if (requestedVideoId && requestedVideoId !== videoId) {
                event.target.loadVideoById?.(startSeconds > 0 ? { videoId: requestedVideoId, startSeconds } : requestedVideoId);
                return;
              }
              // Un salto pedido durante la creación llega después del `start` inicial.
              if (startSeconds > 0 && Math.floor(startSeconds) !== createdStart) event.target.seekTo?.(startSeconds, true);
              event.target.playVideo?.();
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
            onError: (event) => {
              youtubeCreatingRef.current = false;
              // El iframe solo se usa como respaldo de un stream fallido.
              const failedId = event.target?.getVideoData?.()?.video_id || videoIdRef.current;
              // Un error tardío de la canción anterior no debe alterar la actual.
              if (!failedId || failedId !== videoIdRef.current) return;
              setIsPlaying(false);
              setIsBuffering(false);
              setPlayerError('YouTube no permite reproducir esta canción incrustada.');
            },
          },
        });
      }
    }).catch((error) => {
      if (cancelled) return;
      if (!youtubeCreatedRef.current) youtubeCreatingRef.current = false;
      // Se desarma para que el siguiente play reintente la carga.
      if (!youtubeRef.current) setEngineArmed(false);
      setIsBuffering(false);
      setPlayerError(error.message);
    });
    return () => { cancelled = true; };
  }, [videoId, engineNeeded]);

  useEffect(() => releaseEngine, [releaseEngine]);

  // Libera el proceso del iframe cuando lleva tiempo sin usarse; pausar no lo destruye al momento.
  // La canción se lee de las refs: cambiar de pista por <audio> no debe reiniciar la cuenta.
  useEffect(() => {
    if (releaseDelay == null) return undefined;
    const timer = setTimeout(() => {
      if (!youtubeCreatedRef.current) return;
      // En pausa se guarda la posición: el siguiente play recrea el motor ahí.
      if (videoIdRef.current && !usesAudioRef.current) {
        pendingStartRef.current = resumePosition(youtubeRef.current?.getCurrentTime?.(), youtubeRef.current?.getDuration?.());
      }
      releaseEngine();
      setEngineArmed(false);
    }, releaseDelay);
    return () => clearTimeout(timer);
  }, [releaseDelay, releaseEngine]);

  useEffect(() => {
    const audio = audioRef.current;
    // Sin intención de reproducir (canción restaurada al arrancar) no se pide nada.
    if (!videoId || !usesAudio || !audio || !audioArmed) return;
    youtubeRef.current?.pauseVideo?.();
    restoringPausedSongRef.current = false;
    const direct = !isLocal && directAudioAvailable() && !isDirectBlocked(videoId) && !directFailedIds.includes(videoId);
    directRef.current = direct;
    audio.src = isLocal ? localAudioUrl(videoId) : direct ? directAudioUrl(videoId) : streamUrl(videoId);
    audio.load();
    // Salto pedido antes de cargar la fuente (barra o flechas sobre la canción restaurada).
    const startSeconds = pendingStartRef.current;
    pendingStartRef.current = 0;
    if (startSeconds > 0) audio.currentTime = startSeconds;
    // Elegir otra canción aborta este play() (AbortError): no es un fallo y no debe pintar un error
    // sobre la canción nueva.
    audio.play().catch((error) => {
      if (isSupersededPlay({ error, playId: videoId, currentId: videoIdRef.current })) return;
      setPlayerError(isLocal ? 'No se pudo reproducir el archivo descargado.' : 'No se pudo reproducir el audio de este vídeo.');
    });
  }, [videoId, usesAudio, isLocal, audioArmed, directFailedIds]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
    youtubeRef.current?.setVolume?.(Math.round(volume * 100));
    writeStorage('volume', volume);
  }, [volume]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!youtubeRef.current || usesAudio || seeking) return;
      const nextTime = youtubeRef.current.getCurrentTime?.();
      const nextDuration = youtubeRef.current.getDuration?.();
      if (Number.isFinite(nextTime)) setCurrentTime(nextTime);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
    }, 500);
    return () => clearInterval(timer);
  }, [usesAudio, seeking]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: currentSong.thumbnail ? [{ src: currentSong.thumbnail }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => {
      if (usesAudio && !audioArmed) setAudioArmed(true);
      else if (usesAudio) audioRef.current?.play();
      else if (youtubeRef.current?.playVideo) youtubeRef.current.playVideo();
      else wakeEngine();
    });
    navigator.mediaSession.setActionHandler('pause', () => usesAudio ? audioRef.current?.pause() : youtubeRef.current?.pauseVideo?.());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }, [audioArmed, currentSong, usesAudio, playPrev, playNext, wakeEngine]);

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
        if (usesAudio && audioRef.current && audioArmed) audioRef.current.currentTime = value;
        else if (!usesAudio && youtubeRef.current?.seekTo) youtubeRef.current.seekTo(value, true);
        else if (videoId) {
          // Sin motor las flechas solo mueven la barra; la posición se aplica al reproducir.
          const target = clampSeek(value, progressMax);
          pendingStartRef.current = target;
          setCurrentTime(target);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audioArmed, enabled, togglePlay, currentTime, usesAudio, videoId, progressMax]);

  const handleSeek = (event) => { setCurrentTime(Number(event.target.value)); setSeeking(true); };
  const commitSeek = (event) => {
    const value = Number(event.target.value);
    if (usesAudio && audioRef.current && audioArmed) audioRef.current.currentTime = value;
    else if (!usesAudio && youtubeRef.current?.seekTo) youtubeRef.current.seekTo(value, true);
    else if (videoId) {
      // Sin motor o sin fuente cargada: el salto lo arranca y la reproducción empieza en esa posición.
      pendingStartRef.current = clampSeek(value, progressMax);
      if (usesAudio) {
        setIsBuffering(true);
        setAudioArmed(true);
      } else wakeEngine();
    }
    setSeeking(false);
  };
  const audioProps = {
    ref: audioRef,
    // En Tauri el API vive en otro origen; sin credenciales el stream pierde la cuenta vinculada.
    crossOrigin: 'use-credentials',
    preload: 'auto',
    onCanPlay: () => perfMark('audio-canplay', { id: videoIdRef.current }),
    onPlay: () => { setIsPlaying(true); setIsBuffering(false); window.dispatchEvent(new CustomEvent(PLAY_EVENT)); },
    onPause: () => setIsPlaying(false),
    onWaiting: () => setIsBuffering(true),
    onPlaying: () => { setIsBuffering(false); perfMark('audio-playing', { id: videoIdRef.current }); },
    // Un stream sin longitud conocida informa Infinity: se conserva la duración del catálogo.
    onLoadedMetadata: (event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); },
    onTimeUpdate: (event) => { if (!seeking) setCurrentTime(event.currentTarget.currentTime); },
    onEnded: playNext,
    onError: (event) => {
      // Un error tardío de la fuente anterior (ya se eligió otra canción) no debe marcar la actual como fallida.
      if (streamedRef.current && !isCurrentStreamSource(event.currentTarget?.src, videoIdRef.current)) return;
      if (streamedRef.current && directRef.current && videoIdRef.current) {
        // La fuente directa falló: se reintenta por el servidor sin pasar por el iframe.
        const failedId = videoIdRef.current;
        forgetDirect(failedId);
        setPlayerError('');
        setIsBuffering(true);
        setDirectFailedIds((current) => current.includes(failedId) ? current : [...current, failedId]);
        return;
      }
      setIsPlaying(false);
      if (streamedRef.current && videoIdRef.current) {
        const failedId = videoIdRef.current;
        setPlayerError('');
        setIsBuffering(true);
        setStreamFailedIds((current) => current.includes(failedId) ? current : [...current, failedId]);
        return;
      }
      setIsBuffering(false);
      setPlayerError(isLocal ? 'Error al cargar el audio descargado.' : 'No se pudo reproducir esta canción.');
    },
  };
  return {
    audioProps, iframeHostRef, isLocal, isStreamed, currentSong, currentIndex, queue,
    hasNext: currentIndex < queue.length - 1,
    isPlaying, isBuffering, playerError, currentTime, progressMax,
    progressPct: progressMax ? (currentTime / progressMax) * 100 : 0,
    volume, setVolume, playFrom, playShuffled, warmSong, enqueue, togglePlay, playNext, playPrev, closePlayer,
    handleSeek, commitSeek,
  };
}
