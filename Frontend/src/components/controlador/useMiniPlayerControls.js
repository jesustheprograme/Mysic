import { useEffect, useEffectEvent } from 'react'
import { listenToMiniPlayerCommands, ownsMiniPlayer } from '../../features/mini-player/playerBridge.ts'

/** Atiende los comandos del mini reproductor (reproducir/pausar, buscar y volumen) mientras este dock es su dueño. */
export default function useMiniPlayerControls({ changeVolume, seekTo, togglePlayback }) {
  const applyMiniPlayerControl = useEffectEvent((command) => {
    if (!ownsMiniPlayer('mysic')) return
    if (command.type === 'toggle') togglePlayback()
    if (command.type === 'seek') seekTo(command.time)
    if (command.type === 'volume') changeVolume(command.value)
  })

  useEffect(() => {
    let unlisten = () => {}
    let disposed = false

    listenToMiniPlayerCommands(applyMiniPlayerControl).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })

    return () => {
      disposed = true
      unlisten()
    }
  }, [])
}
