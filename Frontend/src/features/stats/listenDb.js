// Escuchas guardadas en el equipo (IndexedDB, una base por usuario): alimentan Estadísticas. Como Limusic: nada sale
// del equipo y no se borra nada solo. IndexedDB y no localStorage: el localStorage de Mysic ya va casi lleno (~5 MB).
//   listens: { id (auto), songId, playedAt (ms), secs }   cada escucha, en bruto (respaldo para reconstruir)
//   + los resúmenes de statsRollup.js (days, tops, songs, artists, albums), al día en la MISMA transacción que la
//     escucha: nunca quedan a medias. La página lee los resúmenes, no las escuchas.
//   meta:    { key: 'rollup', version }                   resúmenes construidos (si falta, se reconstruyen)

import { coversAll, computeStats, rangeStart } from './statsCompute.js'
import { applyListen, compactSong, dayNumber, mergeTops, rankMerged, ROLLUP_STORES, rollupAll } from './statsRollup.js'

const VERSION = 2
const ROLLUP_VERSION = 1
let opened = null
const listeners = new Set()
// Sumas de los tops de los días ya cerrados de cada periodo (ver loadStats). Una escucha nueva siempre es de hoy;
// solo hay que olvidarlas si cambia un día pasado (canción que siguió sonando tras la medianoche) o se rehace todo.
const pastTops = new Map()

/** Avisa cuando cambian las escuchas (nueva, segundos oídos, borrado): Estadísticas se recalcula abierta. */
export function onListensChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const changed = () => { for (const listener of listeners) listener() }

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

function upgrade(db, tx) {
  if (!db.objectStoreNames.contains('listens')) {
    db.createObjectStore('listens', { keyPath: 'id', autoIncrement: true }).createIndex('playedAt', 'playedAt')
  }
  const songs = db.objectStoreNames.contains('songs') ? tx.objectStore('songs') : db.createObjectStore('songs', { keyPath: 'id' })
  // Solo las canciones (no los vídeos largos) tienen `rank`: el índice da su top y su recuento sin recorrer nada.
  if (!songs.indexNames.contains('rank')) songs.createIndex('rank', 'rank')
  if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'day' })
  if (!db.objectStoreNames.contains('tops')) db.createObjectStore('tops', { keyPath: 'day' })
  if (!db.objectStoreNames.contains('artists')) db.createObjectStore('artists', { keyPath: 'key' }).createIndex('rank', 'rank')
  if (!db.objectStoreNames.contains('albums')) db.createObjectStore('albums', { keyPath: 'id' }).createIndex('rank', 'rank')
  if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
}

/**
 * Rehace todos los resúmenes desde las escuchas: al pasar de la versión 1 (solo escuchas) y tras importar el
 * historial antiguo. Lee en una transacción, calcula en memoria y escribe en otra sin esperas intermedias (una
 * transacción de IndexedDB se cierra sola si se espera a algo que no es suyo).
 */
async function rebuild(db) {
  const read = db.transaction(['listens', 'songs'], 'readonly')
  const [listens, songRows] = await Promise.all([request(read.objectStore('listens').getAll()), request(read.objectStore('songs').getAll())])
  const songs = new Map(songRows.map((row) => [row.id, row.song]))
  const stores = await rollupAll(listens, (id) => songs.get(id))

  const write = db.transaction(['meta', ...ROLLUP_STORES], 'readwrite')
  for (const name of ROLLUP_STORES) {
    const store = write.objectStore(name)
    store.clear()
    for (const value of stores[name].values()) store.put(value)
  }
  write.objectStore('meta').put({ key: 'rollup', version: ROLLUP_VERSION })
  await done(write)
  pastTops.clear()
}

async function openReady(owner) {
  const open = indexedDB.open(`mysic-listens:${owner}`, VERSION)
  open.onupgradeneeded = () => upgrade(open.result, open.transaction)
  const db = await request(open)
  // Otra pestaña o ventana con una versión nueva: se cierra para no bloquearla (se reabrirá al volver a usarla).
  db.onversionchange = () => { db.close(); if (opened?.db === db) opened = null }
  const meta = await request(db.transaction('meta', 'readonly').objectStore('meta').get('rollup'))
  if (meta?.version !== ROLLUP_VERSION) await rebuild(db)
  return db
}

function openDb(owner) {
  if (!owner || typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (opened?.owner === owner) return opened.promise
  const promise = openReady(owner).catch(() => null)
  opened = { owner, promise }
  promise.then((db) => { if (opened?.promise === promise) opened.db = db })
  return promise
}

/** `io` de statsRollup sobre una transacción abierta. */
const transactionIo = (tx) => ({
  get: (store, key) => request(tx.objectStore(store).get(key)),
  put: (store, value) => { tx.objectStore(store).put(value) },
})

export { compactSong }

/** Nueva escucha (al pasar el umbral), con sus resúmenes. Devuelve su id para ir sumando los segundos. */
export async function addListen(owner, song, playedAt, secs) {
  const db = await openDb(owner)
  if (!db) return null
  const tx = db.transaction(['listens', ...ROLLUP_STORES], 'readwrite')
  const compact = compactSong(song)
  const rounded = Math.round(secs)
  const id = await request(tx.objectStore('listens').add({ songId: compact.id, playedAt, secs: rounded }))
  await applyListen(transactionIo(tx), compact, playedAt, 1, rounded)
  await done(tx)
  changed()
  return id
}

/** Más segundos oídos de una escucha ya contada: solo se suma la diferencia a los resúmenes. */
export async function updateListenSecs(owner, id, secs) {
  const db = await openDb(owner)
  if (!db || id == null) return
  const tx = db.transaction(['listens', ...ROLLUP_STORES], 'readwrite')
  const listens = tx.objectStore('listens')
  const row = await request(listens.get(id))
  const delta = row ? Math.round(secs) - row.secs : 0
  if (delta > 0) {
    listens.put({ ...row, secs: row.secs + delta })
    const known = await request(tx.objectStore('songs').get(row.songId))
    if (known?.song) await applyListen(transactionIo(tx), known.song, row.playedAt, 0, delta)
  }
  await done(tx)
  if (delta > 0 && dayNumber(row.playedAt) !== dayNumber(Date.now())) pastTops.clear()
  if (delta > 0) changed()
}

export async function clearListens(owner) {
  const db = await openDb(owner)
  if (!db) return
  const tx = db.transaction(['listens', ...ROLLUP_STORES], 'readwrite')
  for (const name of ['listens', ...ROLLUP_STORES]) tx.objectStore(name).clear()
  await done(tx)
  pastTops.clear()
  changed()
}

/** Los N primeros de un índice `rank` (de mayor a menor) sin leer el resto. */
function topOf(index, limit) {
  return new Promise((resolve, reject) => {
    const rows = []
    const cursor = index.openCursor(null, 'prev')
    cursor.onsuccess = () => {
      const current = cursor.result
      if (!current || rows.length >= limit) { resolve(rows); return }
      rows.push(current.value)
      current.continue()
    }
    cursor.onerror = () => reject(cursor.error)
  })
}

const songEntry = (row, plays = row.plays, secs = row.secs) => ({ song: row.song, firstAt: row.firstAt, plays, secs })
const artistEntry = (row, plays = row.plays, secs = row.secs) => ({ name: row.name, id: row.id, cover: row.cover, plays, secs })
const albumEntry = (row, plays = row.plays, secs = row.secs) => ({ id: row.id, title: row.title, artist: row.artist, thumbnail: row.thumbnail, plays, secs })

/**
 * Estadísticas de un periodo. Lee los días (ligeros) y:
 * - si el periodo abarca todo el historial, los totales de siempre (top por índice y recuentos, sin recorrer nada);
 * - si no, los tops diarios del periodo (como mucho 366 registros), que se suman y ordenan.
 */
export async function loadStats(owner, range, now = new Date()) {
  const db = await openDb(owner)
  if (!db) return { empty: true }
  const tx = db.transaction(['days', ...ROLLUP_STORES], 'readonly')
  const days = await request(tx.objectStore('days').getAll())
  const first = days.find((day) => day.plays > 0)
  if (!first) return { empty: true }
  const songs = tx.objectStore('songs')
  const artists = tx.objectStore('artists')
  const albums = tx.objectStore('albums')

  let tops
  if (coversAll(range, first.day, now)) {
    const [songCount, artistCount, topSongs, topArtists, topAlbums] = await Promise.all([
      request(songs.index('rank').count()),
      request(artists.count()),
      topOf(songs.index('rank'), 10),
      topOf(artists.index('rank'), 8),
      topOf(albums.index('rank'), 6),
    ])
    tops = { songCount, artistCount, songs: topSongs.map((row) => songEntry(row)), artists: topArtists.map((row) => artistEntry(row)), albums: topAlbums.map((row) => albumEntry(row)) }
  } else {
    // Los días ya cerrados del periodo se suman una vez y se recuerdan; cada recarga (cada 30 s con música) solo
    // añade el registro de hoy.
    const today = dayNumber(now.getTime())
    const sinceDay = dayNumber(rangeStart(range, now))
    const store = tx.objectStore('tops')
    const key = `${owner}|${sinceDay}|${today}`
    let base = pastTops.get(key)
    if (!base) {
      base = mergeTops(sinceDay < today ? await request(store.getAll(IDBKeyRange.bound(sinceDay, today - 1))) : [])
      pastTops.set(key, base)
      if (pastTops.size > 3) pastTops.delete(pastTops.keys().next().value) // 7 días, 30 días y 12 meses
    }
    const ranked = rankMerged(base, await request(store.get(today)))
    const fill = (store, list, entry) => Promise.all(list.map(async ({ key, plays, secs }) => {
      const row = await request(store.get(key))
      return row ? entry(row, plays, secs) : null
    })).then((rows) => rows.filter(Boolean))
    const [topSongs, topArtists, topAlbums] = await Promise.all([fill(songs, ranked.songs, songEntry), fill(artists, ranked.artists, artistEntry), fill(albums, ranked.albums, albumEntry)])
    tops = { songCount: ranked.songCount, artistCount: ranked.artistCount, songs: topSongs, artists: topArtists, albums: topAlbums }
  }
  return computeStats(days, tops, { range, now })
}

/**
 * Una sola vez por usuario: trae el historial anterior (localStorage, hasta 600 escuchas sin tiempo oído) para que
 * Estadísticas no empiece vacía. Sin tiempo real se cuenta la duración de la canción, como hizo Limusic al migrar.
 */
export async function importLegacy(owner, entries) {
  const flag = `mysic:listens:imported:${owner}`
  try { if (localStorage.getItem(flag)) return 0 } catch { return 0 }
  const db = await openDb(owner)
  if (!db) return 0
  const valid = (entries ?? []).filter((entry) => entry?.song?.id && Number.isFinite(entry.at))
  if (valid.length) {
    const tx = db.transaction(['listens', 'songs'], 'readwrite')
    const listens = tx.objectStore('listens')
    const songs = tx.objectStore('songs')
    const seen = new Set()
    for (const entry of valid) {
      const song = compactSong(entry.song)
      listens.add({ songId: song.id, playedAt: entry.at, secs: song.durationSeconds || 180 })
      // Solo los datos de la canción: `rebuild` rehace sus totales con todas las escuchas.
      if (!seen.has(song.id)) { seen.add(song.id); songs.put({ id: song.id, song, firstAt: entry.at, plays: 0, secs: 0 }) }
    }
    await done(tx)
    await rebuild(db)
  }
  try { localStorage.setItem(flag, '1') } catch { /* sin almacenamiento: se reintentará */ }
  if (valid.length) changed()
  return valid.length
}
