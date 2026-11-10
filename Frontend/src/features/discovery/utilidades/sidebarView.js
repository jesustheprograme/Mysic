// Qué opción de YouTube resalta la barra lateral según la vista actual del navegador de YouTube Music.
// Inicio, Explorar y Biblioteca son secciones de primer nivel. Las vistas de detalle (artista, álbum, playlist,
// búsqueda, descargas, recomendados) heredan la sección desde la que se abrieron.
const TOP_LEVEL = { home: 'home', explore: 'explore', 'official-library': 'library' }

export function sidebarViewFor(kind, previous = 'home') {
  return TOP_LEVEL[kind] ?? previous
}