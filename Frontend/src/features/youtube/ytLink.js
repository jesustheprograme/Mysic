// Enlaces pegados -> lo que Mysic puede abrir. Lógica pura (sin React ni red).
// Referencia: ytlink.ts de limusic (GPL-3.0, solo como guía de los casos que cubre).

/** `{ kind: 'song' | 'playlist' | 'album' | 'artist', id }` o null si no es un enlace de YouTube / YouTube Music conocido. */
export function parseYtLink(input) {
  const text = String(input ?? '').trim()
  if (!text) return null
  let url
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  // music., www., m. o ninguno.
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return null

  const [segment, rest] = url.pathname.replace(/^\/+/, '').split('/')
  if (url.hostname.endsWith('youtu.be')) return segment ? { kind: 'song', id: segment } : null

  // Un enlace con vídeo y lista es una canción sonando dentro de una playlist: lo compartido es la canción.
  const video = url.searchParams.get('v')
  if (video) return { kind: 'song', id: video }
  const list = url.searchParams.get('list')
  // La API de Mysic usa el id de la lista sin el prefijo VL que llevan los ids de /browse.
  if (list) return { kind: 'playlist', id: list.replace(/^VL/, '') }

  if (segment === 'channel' && rest) return { kind: 'artist', id: rest }
  if (segment === 'browse' && rest) {
    if (rest.startsWith('MPRE')) return { kind: 'album', id: rest }
    if (rest.startsWith('VL')) return { kind: 'playlist', id: rest.replace(/^VL/, '') }
    if (rest.startsWith('UC')) return { kind: 'artist', id: rest }
  }
  return null
}

/** ¿Parece un enlace de Spotify (web o URI)? La lectura de verdad la hace el comando de Tauri. */
export function isSpotifyLink(input) {
  const text = String(input ?? '').trim()
  return /^spotify:(track|album|artist|playlist):/i.test(text) || /^(https?:\/\/)?(open|play)\.spotify\.com\//i.test(text)
}

// Sufijos de edición que Spotify añade al título ("- 2015 Remaster", "(Remastered 2011)", "- Radio Edit") y con los
// que YouTube Music no encuentra nada: se quitan, pero no un "feat." ni un título que solo contenga un guion.
const EDITION = /remaster|version|versión|edit\b|mono\b|stereo|deluxe|bonus|live\b|en vivo|\b(19|20)\d\d\b/i

export function cleanTitle(title) {
  let text = String(title ?? '')
  text = text.replace(/\s+-\s+([^-]*)$/, (match, suffix) => (EDITION.test(suffix) ? '' : match))
  text = text.replace(/\s*[([]([^()[\]]*)[)\]]/g, (match, inner) => (EDITION.test(inner) ? '' : match))
  return text.trim()
}

/** Texto de búsqueda de una pista de Spotify en YouTube Music: "título artista principal". */
export function trackQuery(track) {
  return [cleanTitle(track?.title), track?.artists?.[0]].filter(Boolean).join(' ').trim()
}