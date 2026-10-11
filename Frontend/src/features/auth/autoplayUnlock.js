let primedAudio = null
let silentAudioUrl = null

function createSilentAudioUrl() {
  const sampleRate = 8000
  const samples = sampleRate
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)

  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index)
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeText(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)

  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

function releaseSilentAudioUrl() {
  if (!silentAudioUrl) return
  URL.revokeObjectURL(silentAudioUrl)
  silentAudioUrl = null
}

window.addEventListener('pagehide', releaseSilentAudioUrl, { once: true })

export function primeAutoplay() {
  if (primedAudio) return

  silentAudioUrl ??= createSilentAudioUrl()
  const audio = new Audio(silentAudioUrl)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0.001
  primedAudio = audio
  audio.play().catch(() => {
    if (primedAudio === audio) primedAudio = null
  })
}

export function takePrimedAudio(audioUrl) {
  const audio = primedAudio
  if (!audio) return null

  primedAudio = null
  audio.pause()
  audio.loop = false
  audio.currentTime = 0
  audio.volume = 1
  audio.crossOrigin = 'anonymous'
  audio.src = audioUrl
  releaseSilentAudioUrl()
  return audio
}
