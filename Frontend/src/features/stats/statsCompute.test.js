import assert from 'node:assert/strict'
import test from 'node:test'
import { bigDuration, computeStats, formatDuration, rangeStart, streaks } from './statsCompute.js'
import { applyListen, dayNumber, memoryRollup, mergeTops, rankMerged, rankTops, rollupAll } from './statsRollup.js'

const now = new Date(2026, 10, 17, 21, 0) // martes 17-nov-2026, 21:00 local
const at = (day, hour = 10) => new Date(2026, 10, day, hour).getTime()
const song = (id, extra = {}) => ({ id, title: `T${id}`, artist: 'Ado', artistId: 'UCado', album: 'Kyougen', albumId: 'MPRE1', thumbnail: `${id}.jpg`, durationSeconds: 200, ...extra })

const sortedDays = (stores) => [...stores.days.values()].sort((a, b) => a.day - b.day)
const withMeta = (stores, ranked) => ({
  songCount: ranked.songCount,
  artistCount: ranked.artistCount,
  songs: ranked.songs.map(({ key, plays, secs }) => ({ song: stores.songs.get(key).song, firstAt: stores.songs.get(key).firstAt, plays, secs })),
  artists: ranked.artists.map(({ key, plays, secs }) => ({ ...stores.artists.get(key), plays, secs })),
  albums: ranked.albums.map(({ key, plays, secs }) => ({ ...stores.albums.get(key), plays, secs })),
})

/** Lo mismo que hace listenDb.loadStats con los tops diarios del periodo, en memoria. */
async function statsFrom(listens, songs, options) {
  const byId = new Map(songs.map((entry) => [entry.id, entry]))
  const stores = await rollupAll(listens, (id) => byId.get(id))
  const since = dayNumber(rangeStart(options.range, options.now))
  const ranked = rankTops([...stores.tops.values()].filter((record) => record.day >= since))
  return computeStats(sortedDays(stores), withMeta(stores, ranked), options)
}

/** Lo mismo que hace listenDb.loadStats con "Siempre": totales ordenados como sus índices `rank` (de mayor a menor). */
function totalsTops(stores) {
  const desc = (a, b) => {
    for (let index = 0; index < a.rank.length; index += 1) if (a.rank[index] !== b.rank[index]) return b.rank[index] - a.rank[index]
    return 0
  }
  const ranked = (map, key, limit) => [...map.values()].filter((row) => row.rank)
    .sort((a, b) => desc(a, b) || (a[key] < b[key] ? 1 : -1)).slice(0, limit).map((row) => ({ key: row[key], plays: row.plays, secs: row.secs }))
  return {
    songCount: [...stores.songs.values()].filter((row) => row.rank).length,
    artistCount: stores.artists.size,
    songs: ranked(stores.songs, 'id', 10),
    artists: ranked(stores.artists, 'key', 8),
    albums: ranked(stores.albums, 'id', 6),
  }
}

test('rangeStart: periodos en hora local con hoy incluido', () => {
  assert.equal(rangeStart('week', now), new Date(2026, 10, 11).getTime())
  assert.equal(rangeStart('month', now), new Date(2026, 9, 19).getTime())
  assert.equal(rangeStart('year', now), new Date(2025, 11, 1).getTime())
  assert.equal(rangeStart('all', now), 0)
})

test('streaks: actual viva si la última escucha fue hoy o ayer; mejor de todas', () => {
  const days = (...list) => list.map((day) => dayNumber(at(day)))
  assert.deepEqual(streaks(days(1, 2, 3, 10, 11, 16, 17), now), { current: 2, best: 3 })
  assert.deepEqual(streaks(days(10), now), { current: 0, best: 1 })
})

test('computeStats: totales, comparación, tops y vídeos largos', async () => {
  const songs = [
    song('a'),
    song('b', { artist: 'Ado, Eve', artistId: 'UCado', albumId: null }),
    song('c', { artist: 'Eve', artistId: 'UCeve', album: 'Smile', albumId: 'MPRE2' }),
    song('live', { durationSeconds: 3600 }),
  ]
  const listens = [
    { songId: 'a', playedAt: at(2), secs: 100 }, // periodo anterior (7 días): 3-nov…10-nov
    { songId: 'a', playedAt: at(16, 9), secs: 200 },
    { songId: 'a', playedAt: at(17, 23 - 2), secs: 200 },
    { songId: 'b', playedAt: at(16, 23), secs: 150 },
    { songId: 'c', playedAt: at(17, 6), secs: 120 },
    { songId: 'live', playedAt: at(17, 8), secs: 1800 },
  ]
  const stats = await statsFrom(listens, songs, { range: 'week', now })
  assert.equal(stats.secs, 200 + 200 + 150 + 120 + 1800)
  assert.equal(stats.plays, 5)
  assert.equal(stats.songs, 3, 'el directo de una hora no cuenta como canción')
  assert.equal(stats.newSongs, 2, 'b y c se escucharon por primera vez en el periodo')
  assert.equal(stats.artists, 2)
  assert.deepEqual(stats.topArtists.map((artist) => [artist.name, artist.secs, artist.id]), [['Ado', 550, 'UCado'], ['Eve', 270, 'UCeve']])
  assert.deepEqual(stats.topSongs.map((entry) => entry.song.id), ['a', 'b', 'c'])
  assert.deepEqual(stats.topAlbums.map((album) => album.id), ['MPRE1', 'MPRE2'])
  assert.equal(stats.change, null, 'sin escuchas en los 7 días anteriores no hay comparación')
  assert.equal(stats.bars.length, 7)
  assert.equal(stats.peak.secs, 120 + 1800 + 200)
  assert.equal(stats.busiestWeekday, 1, 'martes')
  // Franjas: 06 y 08 (mañana), 09 (mañana), 21 (atardecer), 23 (noche).
  assert.equal(stats.topPart.id, 'morning')
  assert.ok(stats.topPart.share > 0 && stats.topPart.share <= 1, 'el anillo muestra el % de la franja principal')
  assert.equal(stats.heat.flat().filter((level) => level > 0).length, 5)
})

test('computeStats: comparación con el periodo anterior y periodos mensuales', async () => {
  const songs = [song('a')]
  const listens = [{ songId: 'a', playedAt: at(5), secs: 100 }, { songId: 'a', playedAt: at(15), secs: 150 }]
  const week = await statsFrom(listens, songs, { range: 'week', now })
  assert.equal(week.change, 50)
  const year = await statsFrom(listens, songs, { range: 'year', now })
  assert.equal(year.bars.length, 12)
  assert.equal(year.all, true, 'el historial empieza dentro del periodo')
  assert.equal(computeStats([], null, { now }).empty, true)
})

// Datos de prueba deterministas: ~400 días, canciones con colaboraciones, sin álbum y vídeos largos.
function sample(count = 3000) {
  let seed = 7
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const names = ['Ado', 'Eve', 'YOASOBI', 'Kenshi Yonezu', 'Aimer', 'LiSA', 'Artista desconocido']
  const songs = Array.from({ length: 120 }, (_, index) => song(`s${index}`, {
    artist: index % 5 === 0 ? `${names[index % 7]}, ${names[(index + 1) % 6]}` : names[index % 7],
    artistId: `UC${index % 7}`,
    albumId: index % 4 === 0 ? null : `MPRE${index % 15}`,
    durationSeconds: index % 31 === 0 ? 3600 : 120 + (index % 200),
  }))
  const start = now.getTime() - 400 * 86_400_000
  const listens = Array.from({ length: count }, () => ({
    songId: songs[Math.floor(random() ** 2 * songs.length)].id,
    playedAt: Math.floor(start + random() * 400 * 86_400_000),
    secs: 30 + Math.floor(random() * 200),
  })).sort((a, b) => a.playedAt - b.playedAt)
  return { songs, listens }
}

test('resúmenes: escuchas en vivo (umbral + segundos a trozos) = reconstrucción completa', async () => {
  const { songs, listens } = sample()
  const byId = new Map(songs.map((entry) => [entry.id, entry]))
  const live = memoryRollup()
  for (const listen of listens) {
    const first = Math.min(30, listen.secs) // al contarse, como el reproductor
    await applyListen(live.io, byId.get(listen.songId), listen.playedAt, 1, first)
    for (let heard = first; heard < listen.secs;) { // luego cada 30 s y al pausar
      const step = Math.min(30, listen.secs - heard)
      await applyListen(live.io, byId.get(listen.songId), listen.playedAt, 0, step)
      heard += step
    }
  }
  const rebuilt = await rollupAll([...listens].reverse(), (id) => byId.get(id))
  for (const store of Object.keys(rebuilt)) {
    assert.deepEqual(new Map([...live.stores[store]].sort()), new Map([...rebuilt[store]].sort()), store)
  }
})

test('resúmenes: "Siempre" por totales (índices) = sumar los tops de todos los días', async () => {
  const { songs, listens } = sample()
  const byId = new Map(songs.map((entry) => [entry.id, entry]))
  const stores = await rollupAll(listens, (id) => byId.get(id))
  const merged = rankTops([...stores.tops.values()])
  const totals = totalsTops(stores)
  assert.equal(totals.songCount, merged.songCount)
  assert.equal(totals.artistCount, merged.artistCount)
  for (const field of ['songs', 'artists', 'albums']) assert.deepEqual(totals[field], merged[field], field)
  assert.ok(!merged.artists.some((artist) => artist.key === 'artista desconocido'))
  // Días cerrados ya sumados + el registro de hoy (lo que hace cada recarga) = sumarlo todo.
  const records = [...stores.tops.values()].sort((a, b) => a.day - b.day)
  const base = mergeTops(records.slice(0, -1))
  const snapshot = JSON.stringify([...base.s])
  assert.deepEqual(rankMerged(base, records.at(-1)), merged)
  assert.equal(JSON.stringify([...base.s]), snapshot, 'la suma recordada no se modifica')
  // Y el total de "Siempre" cuadra con las escuchas.
  const all = computeStats(sortedDays(stores), withMeta(stores, merged), { range: 'all', now })
  assert.equal(all.secs, listens.reduce((sum, listen) => sum + listen.secs, 0))
  assert.equal(all.plays, listens.length)
  assert.equal(all.newSongs, all.songs, 'en "Siempre" todas las canciones son nuevas')
})

test('formatDuration y bigDuration', () => {
  assert.equal(formatDuration(30), 'menos de 1 min')
  assert.equal(formatDuration(35 * 60), '35 min')
  assert.equal(formatDuration(4 * 3600 + 12 * 60), '4 h 12 min')
  assert.deepEqual(bigDuration(42 * 3600 + 17 * 60), [{ value: '42', unit: 'h' }, { value: '17', unit: 'min' }])
  assert.deepEqual(bigDuration(250 * 3600), [{ value: '250', unit: 'h' }])
})
