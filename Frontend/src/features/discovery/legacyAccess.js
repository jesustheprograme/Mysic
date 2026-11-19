// Secciones del Mysic antiguo (catálogo propio: Inicio, Explorar, Favoritas, Importar música, Historial, Álbumes,
// Artistas, Playlists y Descargas del grupo "Mysic" de la barra lateral). Ya no forman parte de la app: solo las ve
// su dueño. Para los demás no aparecen en la barra lateral y cualquier enlace o historial que lleve a ellas cae en
// el Inicio. La ficha de una playlist ('playlist') no entra: es donde se abren las playlists propias e importadas.
//
// Es un filtro de interfaz, no un control de acceso: el servidor no cambia.

const LEGACY_OWNERS = new Set(['jesusobregon2010@gmail.com'])

export const LEGACY_SECTIONS = new Set(['home', 'explore', 'for-you', 'import', 'recent', 'albums', 'album', 'artists', 'artist', 'playlists', 'downloads'])

/** ¿Puede este usuario ver las secciones del Mysic antiguo? */
export function canSeeLegacyMysic(user) {
  return LEGACY_OWNERS.has(String(user?.email ?? '').trim().toLowerCase())
}

/** ¿Se puede abrir `section` con estos permisos? `import` exige además el permiso de importar. */
export function sectionAllowed(section, { legacy = false, importMusic = false } = {}) {
  if (LEGACY_SECTIONS.has(section) && !legacy) return false
  return section !== 'import' || importMusic
}
