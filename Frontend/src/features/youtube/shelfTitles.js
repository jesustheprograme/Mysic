// Títulos de las secciones de YouTube Music: la API los devuelve en inglés. Se traducen aquí, en el
// cliente, porque el código generado del backend no es editable. Lo desconocido se deja tal cual.

const EXACT = new Map(Object.entries({
  'listen again': 'Volver a escuchar',
  'forgotten favorites': 'Favoritos olvidados',
  'quick picks': 'Selección rápida',
  'albums for you': 'Álbumes para ti',
  'from your library': 'De tu biblioteca',
  'your library': 'Tu biblioteca',
  'mixed for you': 'Mixes para ti',
  'recommended for you': 'Recomendado para ti',
  'music videos for you': 'Videos musicales para ti',
  'new releases': 'Novedades',
  'new albums & singles': 'Álbumes y sencillos nuevos',
  'new albums and singles': 'Álbumes y sencillos nuevos',
  'trending': 'Tendencias',
  'trending songs': 'Canciones en tendencia',
  'trending on youtube': 'Tendencias en YouTube',
  'charts': 'Listas de éxitos',
  'top songs': 'Canciones más populares',
  'top albums': 'Álbumes más populares',
  'top artists': 'Artistas más populares',
  'moods & genres': 'Estados de ánimo y géneros',
  'moods and genres': 'Estados de ánimo y géneros',
  'long listens': 'Escuchas largas',
  'your favorites': 'Tus favoritos',
  'your favourites': 'Tus favoritos',
  'fans might also like': 'A los fans también les gusta',
  'from the community': 'De la comunidad',
  'daily discover': 'Tu descubrimiento diario',
  'your daily discovery': 'Tu descubrimiento diario',
  'the new & what you love': 'Lo nuevo y lo que más te gusta',
  'trending songs for you': 'Canciones en tendencia para ti',
  'featured playlists for you': 'Playlists destacadas para ti',
  'featured playlists': 'Playlists destacadas',
  'live performances': 'Presentaciones en vivo',
  'covers and remixes': 'Covers y remixes',
  'covers & remixes': 'Covers y remixes',
  "today's biggest hits": 'Los mayores éxitos de hoy',
  'springtime vibes': 'Ambiente de primavera',
  'summer vibes': 'Ambiente de verano',
  'autumn vibes': 'Ambiente de otoño',
  'winter vibes': 'Ambiente de invierno',
  'feel good': 'Para sentirse bien',
  'chill': 'Relax',
  'workout': 'Entrenamiento',
  'focus': 'Concentración',
  'party': 'Fiesta',
  'sleep': 'Dormir',
  'commute': 'Desplazamientos diarios',
  'romance': 'Amor',
  'energize': 'Energía',
  'sad': 'Triste',
  'popular': 'Popular',
  'popular releases': 'Lanzamientos populares',
  'popular albums': 'Álbumes populares',
  'popular songs': 'Canciones populares',
  'featured on': 'Aparece en',
  'related artists': 'Artistas relacionados',
  'for you': 'Para ti',
  'discover': 'Descubre',
  'albums': 'Álbumes',
  'singles': 'Sencillos',
  'songs': 'Canciones',
  'videos': 'Videos',
  'artists': 'Artistas',
  'playlists': 'Playlists',
}))

const PATTERNS = [
  [/^similar to (.+)$/i, 'Similar a $1'],
  [/^more from (.+)$/i, 'Más de $1'],
  [/^more like (.+)$/i, 'Más como $1'],
  [/^because you listened to (.+)$/i, 'Porque escuchaste $1'],
  [/^because you liked (.+)$/i, 'Porque te gustó $1'],
  [/^based on (.+)$/i, 'Basado en $1'],
  [/^(.+) radio$/i, 'Radio de $1'],
  [/^(.+) mix$/i, 'Mix de $1'],
  [/^best of (.+)$/i, 'Lo mejor de $1'],
]

export function translateShelfTitle(title) {
  if (typeof title !== 'string') return title
  const trimmed = title.trim()
  const exact = EXACT.get(trimmed.toLocaleLowerCase())
  if (exact) return exact
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement)
  }
  return title
}
