import AudioPlayerDock from './AudioPlayerDock.jsx'
import ControlledPlayerDock from './ControlledPlayerDock.jsx'

// Punto de entrada del controlador de música: con externalPlayback (YouTube Music) solo se pinta el
// estado que da usePlayer; sin él, el dock reproduce el audio del catálogo propio.
function PlayerDock(props) {
  if (props.externalPlayback) return <ControlledPlayerDock {...props} />
  return <AudioPlayerDock {...props} />
}

export default PlayerDock
