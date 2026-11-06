// Modelo de datos del desplegable del buscador. Es puro (sin React ni red) para poder probarlo.
//
// Fuentes:
//  - `suggestions`: /suggest. Rápido pero escaso (máx. 6 entidades) y con subtítulos en bruto.
//  - `search`: /search?type=all. Más lento, pero trae resultado principal, canciones con duración,
//    artistas con oyentes y álbumes con año. Cuando llega sustituye a las sugerencias.

export const MAX_SONGS = 4
export const MAX_ALBUMS = 3
export const MAX_ARTISTS = 3

// Etiquetas de tipo que YouTube antepone al subtítulo ("Artist • 12.4M monthly audience").
const KIND_LABELS = new Set([
  'artist', 'artista', 'song', 'canción', 'cancion', 'album', 'álbum',
  'single', 'sencillo', 'ep', 'video', 'vídeo',
])

const COUNT_PATTERN = /(\d+(?:[.,]\d+)?)\s*([KMB])?\b/i

/** Quita la etiqueta de tipo inicial de un subtítulo y devuelve el resto. */
export function stripKindLabel(subtitle) {
  const parts = String(subtitle ?? '').split('•').map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1 && KIND_LABELS.has(parts[0].toLocaleLowerCase('es'))) parts.shift()
  return parts.join(' · ')
}

/**
 * Traduce "12.4M monthly audience" / "monthly listeners" / "subscribers" al español.
 * Si el texto ya está en español o no se reconoce, se devuelve tal cual (nunca se inventa).
 */
export function localizeAudience(text) {
  const raw = String(text ?? '').trim()
  if (!raw || /oyentes|suscriptores/i.test(raw)) return raw

  const noun = /monthly\s+(?:audience|listeners)/i.test(raw)
    ? 'oyentes mensuales'
    : /subscribers?/i.test(raw) ? 'suscriptores' : null
  const count = COUNT_PATTERN.exec(raw)
  if (!noun || !count) return raw

  const amount = count[1].replace(',', '.')
  return `${amount}${count[2] ? ` ${count[2].toUpperCase()}` : ''} ${noun}`
}

function hasValue(value) {
  return Boolean(value) && value !== '--:--'
}

function songRow(song, extra = {}) {
  const album = hasValue(song.album) && song.album !== 'Sencillo' ? song.album : ''
  return {
    kind: 'song',
    id: song.id,
    title: song.title,
    subtitle: [song.artist, album].filter(hasValue).join(' · '),
    duration: hasValue(song.duration) ? song.duration : '',
    thumbnail: song.thumbnail,
    song,
    ...extra,
  }
}

function albumRow(album) {
  return {
    kind: 'album',
    id: album.id,
    title: album.title,
    subtitle: [album.artist, album.year].filter(hasValue).join(' · '),
    thumbnail: album.thumbnail,
  }
}

function artistRow(artist) {
  return {
    kind: 'artist',
    id: artist.id,
    title: artist.name,
    subtitle: localizeAudience(artist.subtitle),
    thumbnail: artist.thumbnail,
  }
}

/** Normaliza el "resultado principal" (de /search o de la primera sugerencia) a una fila. */
function featuredRow(entity) {
  if (!entity) return null
  const subtitle = entity.kind === 'artist'
    ? localizeAudience(stripKindLabel(entity.subtitle))
    : stripKindLabel(entity.subtitle)
  return { ...entity, subtitle }
}

function entityRow(entity) {
  if (entity.kind === 'song' && entity.song) return { ...songRow(entity.song), thumbnail: entity.thumbnail || entity.song.thumbnail }
  const subtitle = entity.kind === 'artist'
    ? localizeAudience(stripKindLabel(entity.subtitle))
    : stripKindLabel(entity.subtitle)
  return { ...entity, subtitle }
}

const sameEntity = (a, b) => Boolean(a && b) && a.kind === b.kind && a.id === b.id

/**
 * Construye lo que pinta el desplegable.
 *
 * Devuelve { featured, sections, rows }:
 *  - sections: [{ kind, rows, viewAll }] en el orden Canciones, Álbumes, Artistas.
 *  - rows: lista plana (principal + secciones) en el orden visual, para la navegación con teclado.
 * El artista del resultado principal no se repite en "Artistas" salvo que haya otros distintos.
 */
export function buildSearchModel({ suggestions, search, history = [], hasQuery }) {
  if (!hasQuery) {
    const rows = history.map((title) => ({ kind: 'history', title }))
    return { featured: null, sections: [], rows }
  }

  const entities = suggestions?.entities ?? []
  const rich = search && search.type === 'all' ? search : null
  const featured = featuredRow(rich?.top ?? entities[0] ?? null)

  let songs
  let albums
  let artists
  let songTotal
  let albumTotal

  if (rich) {
    songs = (rich.songs ?? []).map((song) => songRow(song))
    albums = (rich.albums ?? []).map(albumRow)
    artists = (rich.artists ?? []).map(artistRow)
  } else {
    const rest = entities.map(entityRow).filter((row) => !sameEntity(row, featured))
    songs = rest.filter((row) => row.kind === 'song')
    albums = rest.filter((row) => row.kind === 'album')
    artists = rest.filter((row) => row.kind === 'artist')
  }

  songs = songs.filter((row) => !sameEntity(row, featured))
  albums = albums.filter((row) => !sameEntity(row, featured))
  artists = artists.filter((row) => !sameEntity(row, featured))
  songTotal = songs.length
  albumTotal = albums.length

  const sections = [
    { kind: 'song', rows: songs.slice(0, MAX_SONGS), viewAll: Boolean(rich) && songTotal > MAX_SONGS },
    { kind: 'album', rows: albums.slice(0, MAX_ALBUMS), viewAll: Boolean(rich) && albumTotal > MAX_ALBUMS },
    { kind: 'artist', rows: artists.slice(0, MAX_ARTISTS), viewAll: false },
  ].filter((section) => section.rows.length)

  const rows = [...(featured ? [featured] : []), ...sections.flatMap((section) => section.rows)]
  return { featured, sections, rows }
}
