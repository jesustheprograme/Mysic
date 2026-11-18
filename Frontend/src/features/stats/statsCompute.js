// Estadísticas de escucha (las de Limusic, stats.rs + stats.ts) a partir de los resúmenes de statsRollup.js: unos
// cientos de registros por año en vez de decenas de miles de escuchas. Funciones puras: entran los días y los tops ya
// ordenados del periodo, sale todo lo que pinta la página.

import { DAY_MS, dayNumber, dayStart } from './statsRollup.js'

export const RANGES = [
  { id: 'week', label: '7 días', since: 'en los últimos 7 días', previous: 'vs. los 7 días anteriores' },
  { id: 'month', label: '30 días', since: 'en los últimos 30 días', previous: 'vs. los 30 días anteriores' },
  { id: 'year', label: '12 meses', since: 'en los últimos 12 meses', previous: 'vs. los 12 meses anteriores' },
  { id: 'all', label: 'Siempre', since: null, previous: null },
]

export const DAYPARTS = [
  { id: 'morning', label: 'Mañana', persona: 'Madrugador', from: 5, to: 12 },
  { id: 'afternoon', label: 'Tarde', persona: 'Oyente vespertino', from: 12, to: 17 },
  { id: 'evening', label: 'Atardecer', persona: 'Oyente del atardecer', from: 17, to: 22 },
  { id: 'night', label: 'Noche', persona: 'Noctámbulo', from: 22, to: 5 },
]

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Inicio del periodo en hora local (hoy incluido): 7 días = hoy y los 6 anteriores; 12 meses = desde el día 1. */
export function rangeStart(range, now = new Date()) {
  const today = startOfDay(now)
  if (range === 'week') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime()
  if (range === 'month') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29).getTime()
  if (range === 'year') return new Date(today.getFullYear(), today.getMonth() - 11, 1).getTime()
  return 0
}

/** ¿El periodo abarca todo el historial? Entonces sus tops son los totales de siempre. */
export const coversAll = (range, firstDay, now = new Date()) => range === 'all' || rangeStart(range, now) <= dayStart(firstDay)

/** Rachas de días seguidos con escuchas (`days`: números de día ascendentes). La actual sigue viva si la última fue hoy o ayer. */
export function streaks(days, now = new Date()) {
  if (!days.length) return { current: 0, best: 0 }
  let best = 1
  let run = 1
  for (let index = 1; index < days.length; index += 1) {
    run = days[index] === days[index - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  const today = dayNumber(now.getTime())
  return { current: days.at(-1) >= today - 1 ? run : 0, best }
}

function buildBars(range, since, now, inRange, firstAt) {
  const monthly = range === 'year' || (range === 'all' && now.getTime() - firstAt > 92 * DAY_MS)
  const bars = []
  if (monthly) {
    const start = range === 'year' ? new Date(since) : new Date(firstAt)
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      bars.push({ key: `${cursor.getFullYear()}-${cursor.getMonth()}`, start: cursor.getTime(), secs: 0, monthly: true })
    }
    const index = new Map(bars.map((bar, position) => [bar.key, position]))
    for (const day of inRange) {
      const date = new Date(dayStart(day.day))
      const position = index.get(`${date.getFullYear()}-${date.getMonth()}`)
      if (position != null) bars[position].secs += day.secs
    }
  } else {
    const first = range === 'all' ? new Date(firstAt) : new Date(since)
    for (let cursor = first; cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
      bars.push({ key: dayNumber(cursor.getTime()), start: cursor.getTime(), secs: 0, monthly: false })
    }
    const index = new Map(bars.map((bar, position) => [bar.key, position]))
    for (const day of inRange) {
      const position = index.get(day.day)
      if (position != null) bars[position].secs += day.secs
    }
  }
  return bars
}

/** Segundos del periodo anterior, de igual duración. Su primer día suele quedar a medias: cuenta desde su hora. */
function previousSecs(days, since, nowMs) {
  const prevSince = since - (nowMs - since)
  const firstDay = dayNumber(prevSince)
  const firstHour = new Date(prevSince).getHours()
  const sinceDay = dayNumber(since)
  let total = 0
  for (const day of days) {
    if (day.day < firstDay || day.day >= sinceDay) continue
    total += day.day === firstDay ? day.hours.reduce((sum, secs, hour) => sum + (hour >= firstHour ? secs : 0), 0) : day.secs
  }
  return total
}

/**
 * Todo lo de la página para un periodo.
 * `days`: todos los registros diarios, ascendentes. `tops`: { songCount, artistCount, songs: [{ song, firstAt, plays,
 * secs }], artists: [{ name, id, cover, plays, secs }], albums: [{ id, title, artist, thumbnail, plays, secs }] }.
 */
export function computeStats(days, tops, { range = 'month', now = new Date() } = {}) {
  const listened = days.filter((day) => day.plays > 0)
  if (!listened.length) return { empty: true }
  const nowMs = now.getTime()
  const firstAt = dayStart(listened[0].day)
  const since = rangeStart(range, now)
  const all = coversAll(range, listened[0].day, now)
  const sinceDay = dayNumber(since)
  const today = dayNumber(nowMs)
  const inRange = listened.filter((day) => day.day >= sinceDay && day.day <= today)

  let secs = 0
  let plays = 0
  let newSongs = 0
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const hours = new Array(24).fill(0)
  const weekdays = new Array(7).fill(0)
  for (const day of inRange) {
    secs += day.secs
    plays += day.plays
    newSongs += day.fresh
    const weekday = (new Date(dayStart(day.day)).getDay() + 6) % 7 // lunes primero
    weekdays[weekday] += day.secs
    for (let hour = 0; hour < 24; hour += 1) {
      heat[weekday][hour] += day.hours[hour]
      hours[hour] += day.hours[hour]
    }
  }
  const prevSecs = all ? 0 : previousSecs(listened, since, nowMs)

  const bars = buildBars(range, since, now, inRange, firstAt)
  const peak = bars.reduce((best, bar) => (bar.secs > (best?.secs ?? -1) ? bar : best), null)

  const inPart = (part, hour) => (part.from < part.to ? hour >= part.from && hour < part.to : hour >= part.from || hour < part.to)
  const dayparts = DAYPARTS.map((part) => ({ ...part, secs: hours.reduce((total, value, hour) => total + (inPart(part, hour) ? value : 0), 0) }))
  const topPart = dayparts.reduce((best, part) => (part.secs > best.secs ? part : best), dayparts[0])
  const heatMax = Math.max(0, ...heat.flat())
  const busiestWeekday = weekdays.indexOf(Math.max(...weekdays))
  const busiestHour = hours.indexOf(Math.max(...hours))

  return {
    empty: false,
    range,
    all,
    firstAt,
    secs,
    plays,
    change: all || prevSecs <= 0 ? null : Math.round(((secs - prevSecs) / prevSecs) * 100),
    songs: tops.songCount,
    newSongs,
    artists: tops.artistCount,
    streak: streaks(listened.map((day) => day.day), now),
    bars,
    peak: peak && peak.secs > 0 ? peak : null,
    average: bars.length ? secs / bars.length : 0,
    topArtists: tops.artists,
    topSongs: tops.songs,
    topAlbums: tops.albums,
    dayparts: dayparts.map((part) => ({ ...part, share: secs ? part.secs / secs : 0 })),
    topPart: topPart.secs > 0 ? { ...topPart, share: topPart.secs / secs } : null,
    heat: heat.map((row) => row.map((value) => (value > 0 && heatMax ? Math.ceil((value / heatMax) * 4) : 0))),
    heatSecs: heat,
    busiestWeekday: weekdays[busiestWeekday] > 0 ? busiestWeekday : null,
    busiestHour: hours[busiestHour] > 0 ? busiestHour : null,
  }
}

/** "4 h 12 min", "35 min", "menos de 1 min". */
export function formatDuration(secs) {
  const minutes = Math.floor((secs || 0) / 60)
  if (minutes < 1) return 'menos de 1 min'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** El total grande, en partes número/unidad: [42 h][17 min]. Más de 100 h, solo horas. */
export function bigDuration(secs) {
  const minutes = Math.floor((secs || 0) / 60)
  const hours = Math.floor(minutes / 60)
  if (hours >= 100) return [{ value: hours.toLocaleString('es-ES'), unit: 'h' }]
  if (!hours) return [{ value: String(minutes), unit: 'min' }]
  return [{ value: String(hours), unit: 'h' }, { value: String(minutes % 60), unit: 'min' }]
}
