export function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

export function getMediaSessionArtwork(artwork) {
  if (!artwork) return []

  try {
    return [{ src: new URL(artwork, window.location.href).href }]
  } catch {
    return []
  }
}

export function setMediaSessionAction(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    // Algunos navegadores exponen Media Session sin implementar todas las acciones.
  }
}

export function createWaveformPeaks(seed, count = 96) {
  let hash = Array.from(String(seed ?? 'track')).reduce((value, character) => (
    ((value * 31) + character.charCodeAt(0)) >>> 0
  ), 7)

  return Array.from({ length: count }, (_, index) => {
    hash = (hash * 1664525 + 1013904223) >>> 0
    const noise = hash / 0xffffffff
    const envelope = 0.55 + Math.sin((index / count) * Math.PI) * 0.45
    return Math.min(1, Math.max(0.12, (0.35 + noise * 0.65) * envelope))
  })
}
