// Resúmenes de Estadísticas: lo que aporta cada escucha a los registros precalculados, para que la página no tenga
// que recorrer todas las escuchas (con años de historial serían cientos de miles).
//   days:    { day, plays, secs, fresh, hours[24] }        ligero: barras, rachas, comparación, franjas y mapa de calor
//   tops:    { day, s: {songId: [plays, secs]}, a: {artistKey: …}, l: {albumId: …} }   tops de 7 días, 30 días, 12 meses
//   songs:   { id, song, firstAt, plays, secs, rank? }     totales de siempre (rank = [plays, secs], solo canciones)
//   artists: { key, name, id, cover, plays, secs, rank }   rank = [secs, plays]
//   albums:  { id, title, artist, thumbnail, plays, secs, rank }
// `applyListen` es la única regla: la usan tanto cada escucha nueva o actualizada como la reconstrucción completa.

export const DAY_MS = 86_400_000
// Más largo que esto (directos, sesiones, pódcast) suma tiempo y reproducciones, pero no cuenta como canción.
export const LONGEST_SONG_SECONDS = 15 * 60
export const UNKNOWN_ARTIST = 'Artista desconocido'

/** Número de día local: entero estable (clave de IndexedDB) sin desfases de zona horaria ni de horario de verano. */
export function dayNumber(ms) {
  const date = new Date(ms)
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
}

/** Medianoche local del día `day`. */
export function dayStart(day) {
  const date = new Date(day * DAY_MS)
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).getTime()
}

export const splitArtists = (artist) => String(artist || '').split(/\s*,\s*/).map((name) => name.trim()).filter((name) => name && name !== UNKNOWN_ARTIST)

/** Datos compactos de una canción para Estadísticas (los mismos que usa el reproductor para volver a ponerla). */
export function compactSong(song) {
  return {
    id: song.id,
    title: song.title ?? '',
    artist: song.artist ?? '',
    artistId: song.artistId ?? null,
    album: typeof song.album === 'string' ? song.album : song.album?.title ?? song.albumTitle ?? '',
    albumId: song.albumId ?? null,
    thumbnail: song.thumbnail ?? song.artwork ?? null,
    durationSeconds: Number(song.durationSeconds) || 0,
  }
}

/** A qué registros va una escucha. Colaboraciones: cuenta cada artista; el id solo lo trae el primero. */
export function contribution(song, playedAt) {
  const long = song.durationSeconds > LONGEST_SONG_SECONDS
  const names = long ? [] : splitArtists(song.artist)
  return {
    day: dayNumber(playedAt),
    hour: new Date(playedAt).getHours(),
    songId: song.id,
    long,
    thumbnail: song.thumbnail ?? null,
    artists: names.map((name, position) => ({ key: name.toLocaleLowerCase(), name, id: position === 0 ? song.artistId ?? null : null })),
    album: !long && song.albumId ? { id: song.albumId, title: song.album ?? '', artist: names[0] ?? '', thumbnail: song.thumbnail ?? null } : null,
  }
}

const bump = (pair, plays, secs) => [(pair?.[0] ?? 0) + plays, (pair?.[1] ?? 0) + secs]

/**
 * Suma una escucha (`plays` = 1, `secs` oídos al contarla) o más segundos de una ya contada (`plays` = 0) a todos los
 * resúmenes. `io`: { get(store, key) → registro | undefined (o su promesa), put(store, registro) }. Los registros que
 * devuelve `get` se modifican en el sitio: IndexedDB ya entrega copias y la reconstrucción trabaja en memoria.
 */
export async function applyListen(io, song, playedAt, plays, secs) {
  const c = contribution(song, playedAt)

  const known = await io.get('songs', song.id)
  const total = known ?? { id: song.id, firstAt: playedAt, plays: 0, secs: 0 }
  total.song = song
  total.firstAt = Math.min(total.firstAt, playedAt)
  total.plays += plays
  total.secs += secs
  if (c.long) delete total.rank // sin `rank` no entra en el índice: ni top ni recuento de canciones
  else total.rank = [total.plays, total.secs]
  io.put('songs', total)

  const day = (await io.get('days', c.day)) ?? { day: c.day, plays: 0, secs: 0, fresh: 0, hours: new Array(24).fill(0) }
  day.plays += plays
  day.secs += secs
  day.hours[c.hour] += secs
  if (!known && !c.long) day.fresh += 1 // primera escucha de esta canción: "n nuevas"
  io.put('days', day)

  if (c.long) return
  const tops = (await io.get('tops', c.day)) ?? { day: c.day, s: {}, a: {}, l: {} }
  tops.s[c.songId] = bump(tops.s[c.songId], plays, secs)
  for (const artist of c.artists) tops.a[artist.key] = bump(tops.a[artist.key], plays, secs)
  if (c.album) tops.l[c.album.id] = bump(tops.l[c.album.id], plays, secs)
  io.put('tops', tops)

  for (const artist of c.artists) {
    const record = (await io.get('artists', artist.key)) ?? { key: artist.key, name: artist.name, id: null, cover: null, plays: 0, secs: 0 }
    record.id ??= artist.id
    record.cover ??= c.thumbnail
    record.plays += plays
    record.secs += secs
    record.rank = [record.secs, record.plays]
    io.put('artists', record)
  }
  if (c.album) {
    const record = (await io.get('albums', c.album.id)) ?? { ...c.album, plays: 0, secs: 0 }
    record.title ||= c.album.title
    record.thumbnail ??= c.album.thumbnail
    record.plays += plays
    record.secs += secs
    record.rank = [record.secs, record.plays]
    io.put('albums', record)
  }
}

export const ROLLUP_STORES = ['songs', 'days', 'tops', 'artists', 'albums']
const KEYS = { songs: 'id', days: 'day', tops: 'day', artists: 'key', albums: 'id' }

/** Resúmenes en memoria (reconstrucción y pruebas): mismo `io` que IndexedDB, sobre Maps. */
export function memoryRollup() {
  const stores = Object.fromEntries(ROLLUP_STORES.map((name) => [name, new Map()]))
  return {
    stores,
    io: {
      get: (store, key) => stores[store].get(key),
      put: (store, value) => { stores[store].set(value[KEYS[store]], value) },
    },
  }
}

/** Todos los resúmenes desde las escuchas (en orden: la primera de cada canción es la que la marca como nueva). */
export async function rollupAll(listens, songOf) {
  const { stores, io } = memoryRollup()
  const ordered = [...listens].sort((a, b) => a.playedAt - b.playedAt)
  for (const listen of ordered) {
    const song = songOf(listen.songId)
    if (song) await applyListen(io, song, listen.playedAt, 1, listen.secs)
  }
  return stores
}

const bySongs = (a, b) => b.plays - a.plays || b.secs - a.secs || (a.key < b.key ? 1 : -1)
const byTime = (a, b) => b.secs - a.secs || b.plays - a.plays || (a.key < b.key ? 1 : -1)

const FIELDS = ['s', 'a', 'l']

/** Suma de varios registros `tops` diarios: { s|a|l: Map(clave → [plays, secs]) }. */
export function mergeTops(records) {
  const merged = { s: new Map(), a: new Map(), l: new Map() }
  for (const record of records) {
    for (const field of FIELDS) {
      const sums = merged[field]
      const source = record[field]
      for (const key in source) {
        const sum = sums.get(key)
        if (sum) { sum[0] += source[key][0]; sum[1] += source[key][1] } else sums.set(key, [source[key][0], source[key][1]])
      }
    }
  }
  return merged
}

/**
 * Tops y recuentos de `base` (una suma de mergeTops, que no se modifica) más un registro diario `extra` (hoy, que va
 * cambiando). Selección parcial: solo se guardan los N mejores, sin ordenar miles de entradas. Mismo orden que los
 * índices de los totales (empates: clave descendente) para que "Siempre" y los demás periodos ordenen igual.
 */
export function rankMerged(base, extra = null, { songs = 10, artists = 8, albums = 6 } = {}) {
  const rank = (field, limit, compare) => {
    const sums = base[field]
    const more = extra?.[field] ?? {}
    const best = []
    const offer = (key, plays, secs) => {
      const entry = { key, plays, secs }
      if (best.length === limit && compare(entry, best[limit - 1]) >= 0) return
      let index = best.length
      while (index > 0 && compare(entry, best[index - 1]) < 0) index -= 1
      best.splice(index, 0, entry)
      if (best.length > limit) best.pop()
    }
    let count = sums.size
    for (const [key, [plays, secs]] of sums) offer(key, plays + (more[key]?.[0] ?? 0), secs + (more[key]?.[1] ?? 0))
    for (const key in more) if (!sums.has(key)) { count += 1; offer(key, more[key][0], more[key][1]) }
    return { count, best }
  }
  const songRank = rank('s', songs, bySongs)
  const artistRank = rank('a', artists, byTime)
  return { songCount: songRank.count, artistCount: artistRank.count, songs: songRank.best, artists: artistRank.best, albums: rank('l', albums, byTime).best }
}

/** Tops de un periodo a partir de sus registros `tops` por día. */
export const rankTops = (records, limits) => rankMerged(mergeTops(records), null, limits)
