import { useEffect, useRef } from 'react'
import { playHistoryOwner } from '../youtube/playHistory.js'
import { addListen, updateListenSecs } from './listenDb.js'
import { createListenTracker } from './listenTracker.js'

/**
 * Cuenta las escuchas del reproductor de YouTube Music para Estadísticas. Recibe la posición en cada actualización del
 * reproductor (unas 2-4 por segundo) y guarda en IndexedDB del usuario actual. Al pausar, ocultar la ventana o cerrar
 * se guarda lo oído (como el `flush_position` de Limusic).
 */
export default function useListenTracker({ song, position, duration, playing }) {
  const trackerRef = useRef(null)
  if (!trackerRef.current) {
    trackerRef.current = createListenTracker({
      insert: (current, playedAt, secs) => addListen(playHistoryOwner(), current, playedAt, secs),
      update: (id, secs) => updateListenSecs(playHistoryOwner(), id, secs).catch(() => {}),
    })
  }

  useEffect(() => {
    trackerRef.current.tick({ song, position, duration, playing })
  }, [song, position, duration, playing])

  useEffect(() => {
    if (!playing) trackerRef.current.flush()
  }, [playing])

  useEffect(() => {
    const flush = () => trackerRef.current.flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      trackerRef.current.end()
    }
  }, [])
}
