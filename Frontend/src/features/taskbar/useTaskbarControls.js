import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useEffectEvent } from 'react'
import { runTaskbarControl, TASKBAR_EVENT, taskbarState } from './taskbarModel.js'

// Solo en la ventana principal de la aplicación de escritorio (el mini reproductor no tiene botón en la barra).
const inDesktopMainWindow = () => typeof window !== 'undefined'
  && (isTauri() || Boolean(window.__TAURI_INTERNALS__))
  && !window.__MYSIC_MINI_PLAYER__

const push = (state) => invoke('set_taskbar_playback', { state }).catch(() => {})

/**
 * Conecta un reproductor con los botones de la miniatura de la barra de tareas de Windows (anterior,
 * reproducir/pausar, siguiente y me gusta). Solo el reproductor activo (`active`) los controla.
 */
export default function useTaskbarControls({ active = true, canLike = true, hasTrack, isPlaying, liked, onNext, onPrevious, onToggleLike, onTogglePlayback }) {
  const handle = useEffectEvent((control) => {
    runTaskbarControl(control, { liked, onNext, onPrevious, onToggleLike, onTogglePlayback })
  })

  useEffect(() => {
    if (!active || !inDesktopMainWindow()) return undefined
    void push(taskbarState({ canLike, hasTrack, isPlaying, liked }))
    return undefined
  }, [active, canLike, hasTrack, isPlaying, liked])

  useEffect(() => {
    if (!active || !inDesktopMainWindow()) return undefined
    let disposed = false
    let unlisten = () => {}
    listen(TASKBAR_EVENT, (event) => handle(event.payload)).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    }).catch(() => {})
    return () => {
      disposed = true
      unlisten()
      // Este reproductor deja de mandar: los botones se desactivan hasta que otro tome el control.
      void push(taskbarState())
    }
  }, [active])
}
