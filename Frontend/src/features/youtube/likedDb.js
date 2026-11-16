// Lista completa de "Me gusta" guardada en IndexedDB (appDb.js). Cada canción va compacta (favoriteCodec), ~250
// caracteres: 6.000 canciones son ~1,5 MB. `addedAt` guarda cuándo vio Mysic cada canción por primera vez en la lista
// (YouTube no da la fecha real): las que ya estaban en la primera sincronización no tienen fecha.
import { dbDelete, dbGet, dbPut, STORES } from './appDb.js'
import { packFavorites, unpackFavorites } from './favoriteCodec.js'

/** Lista guardada de un usuario: { songs, complete, fullAt, savedAt, addedAt } o null. */
export async function readLiked(userKey) {
  const record = await dbGet(STORES.liked, userKey)
  if (!record || !Array.isArray(record.songs)) return null
  return { ...record, addedAt: record.addedAt ?? {}, songs: unpackFavorites(record.songs).filter((song) => song && typeof song === 'object') }
}

// El formato compacto guarda la duración en segundos; las canciones del servidor a veces solo traen "3:05".
const toSeconds = (text) => String(text ?? '').split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0) || undefined
const withSeconds = (song) => (song.durationSeconds || !song.duration ? song : { ...song, durationSeconds: toSeconds(song.duration) })

/** Guarda la lista completa de un usuario (compacta). */
export function writeLiked(userKey, { addedAt = {}, complete, fullAt, songs }) {
  return dbPut(STORES.liked, userKey, { addedAt, complete, fullAt, savedAt: Date.now(), songs: packFavorites(songs.map(withSeconds)) })
}

/** Borra la lista de un usuario (al desvincular la cuenta). */
export const removeLiked = (userKey) => dbDelete(STORES.liked, userKey)
