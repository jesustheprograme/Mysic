// Guardar una canción en las playlists propias de YouTube Music (diálogo "Guardar en playlist"). Lógica pura.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Id de vídeo de YouTube de una canción, o null si es del catálogo propio de Mysic (esas no van a YouTube). */
export function youtubeVideoIdOf(song) {
  if (!song) return null
  if (VIDEO_ID.test(String(song.videoId ?? ''))) return song.videoId
  const isYoutube = song.source === 'youtube' || !song.audioUrl
  return isYoutube && VIDEO_ID.test(String(song.id ?? '')) ? song.id : null
}

const bareId = (id) => String(id ?? '').replace(/^VL/, '')
// "Liked Music" (LM) es la lista de Me gusta: se gestiona con el corazón, no como una playlist donde guardar.
const NOT_A_PLAYLIST = new Set(['LM'])

/** Las playlists que da YouTube con la portada y el número de canciones de la biblioteca (la barra lateral). */
export function withLibraryArt(targets, libraryPlaylists = []) {
  const library = new Map(libraryPlaylists.map((playlist) => [bareId(playlist.id), playlist]))
  return targets.filter((target) => !NOT_A_PLAYLIST.has(bareId(target.id))).map((target) => {
    const known = library.get(bareId(target.id))
    return { ...target, thumbnail: known?.thumbnail ?? null, count: known?.count ?? known?.itemCount ?? null }
  })
}

// YouTube Music no dice si una playlist ya tiene la canción (`contains` llega siempre a false; comprobado con 87
// playlists reales, incluida la de Me gusta). Lo que se guarda desde aquí se recuerda durante la sesión para que el
// diálogo lo muestre marcado al reabrirlo y se pueda quitar desmarcándolo.
const saved = new Set()
const savedKey = (videoId, playlistId) => `${videoId}|${bareId(playlistId)}`

/** Anota que `videoId` quedó guardado (o quitado) en una playlist. */
export function rememberSaved(videoId, playlistId, contains) {
  if (contains) saved.add(savedKey(videoId, playlistId))
  else saved.delete(savedKey(videoId, playlistId))
}

/** Marca como contenidas las playlists donde esta sesión guardó la canción. */
export function withRemembered(targets, videoId) {
  return targets.map((target) => (saved.has(savedKey(videoId, target.id)) && !target.contains ? { ...target, contains: true } : target))
}

/** Qué hay que cambiar en YouTube: solo las playlists cuya marca cambió respecto a lo que ya tenían. */
export function targetChanges(targets, selectedIds) {
  return targets
    .filter((target) => target.contains !== selectedIds.has(target.id))
    .map((target) => ({ id: target.id, add: selectedIds.has(target.id) }))
}

/** Mensaje para un error al cargar o guardar (el servidor puede no tener aún la ruta). */
export function targetsErrorMessage(error) {
  if (error?.status === 409) return 'Vincula tu cuenta de YouTube Music para guardar en tus playlists.'
  if (error?.status === 404) return 'El servidor de Mysic aún no permite guardar en playlists de YouTube Music.'
  if (error?.status === 403) return 'No puedes modificar esa playlist.'
  return error?.message || 'No se pudieron cargar tus playlists de YouTube Music.'
}
