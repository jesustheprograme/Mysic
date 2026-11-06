import { invoke, isTauri } from '@tauri-apps/api/core'
import { once } from '@tauri-apps/api/event'

const SESSION_EVENT = 'youtube-music-session'
const SESSION_ERROR_EVENT = 'youtube-music-session-error'
const CAPTURE_TIMEOUT_MS = 3 * 60_000

export const desktopSessionAvailable = isTauri()

function errorMessage(payload) {
  return typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message
    : 'No se pudo obtener la sesión de YouTube Music.'
}

export async function captureYoutubeMusicSession() {
  if (!desktopSessionAvailable) {
    throw new Error('El inicio de sesión integrado solo está disponible en la aplicación de escritorio.')
  }

  let resolveCapture
  let rejectCapture
  const captured = new Promise((resolve, reject) => {
    resolveCapture = resolve
    rejectCapture = reject
  })
  const unlistenSession = await once(SESSION_EVENT, (event) => resolveCapture(event.payload))
  const unlistenError = await once(SESSION_ERROR_EVENT, (event) => rejectCapture(new Error(errorMessage(event.payload))))
  const timeout = setTimeout(() => rejectCapture(new Error('El acceso a YouTube Music tardó demasiado. Inténtalo nuevamente.')), CAPTURE_TIMEOUT_MS)

  try {
    await invoke('open_youtube_music_login')
    const session = await captured
    if (typeof session?.cookie !== 'string' || !session.cookie) {
      throw new Error('YouTube Music no devolvió una sesión válida.')
    }
    return session
  } finally {
    clearTimeout(timeout)
    unlistenSession()
    unlistenError()
  }
}
