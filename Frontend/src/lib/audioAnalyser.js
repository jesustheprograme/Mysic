let audioContext
const connections = new WeakMap()

function getAudioContext() {
  audioContext ??= new AudioContext()
  return audioContext
}

export function connectAudioAnalyser(audioElement) {
  const existingConnection = connections.get(audioElement)
  if (existingConnection) {
    if (!existingConnection.connected) {
      existingConnection.source.connect(existingConnection.analyser)
      existingConnection.analyser.connect(existingConnection.context.destination)
      existingConnection.connected = true
    }
    return existingConnection.analyser
  }

  const context = getAudioContext()
  const analyser = context.createAnalyser()
  const source = context.createMediaElementSource(audioElement)
  source.connect(analyser)
  analyser.connect(context.destination)
  connections.set(audioElement, { analyser, connected: true, context, source })
  return analyser
}

export function disconnectAudioAnalyser(audioElement) {
  const connection = connections.get(audioElement)
  if (!connection?.connected) return
  connection.source.disconnect()
  connection.analyser.disconnect()
  connection.connected = false
}

export function resumeAudioContext() {
  if (audioContext?.state === 'suspended') return audioContext.resume()
  return Promise.resolve()
}
