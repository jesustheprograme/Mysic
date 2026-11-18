// Proveedores de letras. Cada uno: { id, name, get(req, ctx) } → { synced, lines, plain } | null (no la tiene).
// Lanza si el proveedor no responde (red, 5xx): así la interfaz distingue "No se encontró" de "Inaccesible".
//
// req: { videoId, title, artist, album, duration (s), searched }   ctx: { http, server }
//   http(request) → { status, body }   petición desde el equipo (comando Rust lyrics_http)
//   server(params) → { found, synced, plain }   LRCLIB a través del servidor de Mysic (caché en disco)
//
// Endpoints y emparejamiento tomados del análisis de Limusic (src-tauri/src/lyrics.rs) y medidos el 2026-11-17.
import { parseAny, parseKpoe, parseLrc, parseTtmlTime, toResult } from './parse.js'

const MATCH_TOLERANCE = 5

/** Título para buscar: sin "(feat. …)", "[Remastered]", "- Remastered 2011", "(Official Video)"… */
export function searchTitle(title) {
  return String(title || '')
    .replace(/\s*[([][^)\]]*\b(?:feat\.?|ft\.|with|remaster\w*|version|live|official|video|audio|lyrics?|mv)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(single|remaster(ed)?(\s+\d{4})?|\d{4}\s+remaster(ed)?|radio edit|album version|live)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || String(title || '').trim()
}

/** Primer artista: "A, B & C" → "A". Las búsquedas por texto aciertan más con uno solo. */
export const mainArtist = (artist) => String(artist || '').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|·)\s*/i)[0].trim()

/** El candidato de duración más cercana dentro de ±5 s; sin duración propia, el primero. */
export function bestByDuration(duration, candidates, seconds) {
  if (!(duration > 0)) return candidates[0] ?? null
  let best = null
  let bestDiff = Infinity
  for (const candidate of candidates) {
    const value = seconds(candidate)
    const diff = Number.isFinite(value) ? Math.abs(value - duration) : Infinity
    if (diff <= MATCH_TOLERANCE && diff < bestDiff) { best = candidate; bestDiff = diff }
  }
  return best
}

// Créditos que los catálogos chinos ponen como primeras líneas ("作词 : …", "制作人 : …", "Produced by …").
const CREDIT_LINE = /^\s*(作词|作曲|编曲|制作人|监制|混音|母带|和声|吉他|贝斯|鼓|词|曲|lyrics? by|composed by|written by|produced by|producer|arranged by|mixed by)\s*[:：]/i
export const withoutCredits = (lines) => lines.filter((line) => !CREDIT_LINE.test(line.text))

function json(response, provider) {
  if (response.status === 404) return null
  if (response.status >= 500 || response.status === 429) throw new Error(`${provider} ${response.status}`)
  try { return JSON.parse(response.body) } catch { return null }
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null)).toString()

function decodeBase64(text) {
  try {
    const binary = atob(text)
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch {
    return ''
  }
}

const lrclib = {
  id: 'lrclib',
  name: 'LRCLIB',
  async get(req, { server }) {
    // El servidor solo acepta coincidencias de duración: sin ella no hay nada que pedir.
    if (!(req.duration > 0)) return null
    const data = await server({ title: req.title, artist: req.artist, album: req.searched ? undefined : req.album, duration: req.duration })
    if (!data?.found) return null
    return toResult(Array.isArray(data.synced) ? data.synced : [], data.plain)
  },
}

const boidu = {
  id: 'boidu',
  name: 'Boidu',
  async get(req, { http }) {
    if (!(req.duration > 0)) return null
    const base = { s: req.title, a: req.artist, d: Math.round(req.duration) }
    for (const album of req.album && !req.searched ? [req.album, undefined] : [undefined]) {
      const response = await http({ url: `https://lyrics-api.boidu.dev/getLyrics?${query({ ...base, al: album })}` })
      if (response.status === 401) continue // no está en su caché con esta clave
      const data = json(response, 'Boidu')
      const text = data?.ttml || data?.syncedLyrics || data?.lyrics || data?.lrc
      if (typeof text === 'string' && text.trim()) return toResult(parseAny(text), /</.test(text) ? '' : text)
      if (Array.isArray(text)) return toResult(parseAny(JSON.stringify(text)))
      return null
    }
    return null
  },
}

const lyricsplus = {
  id: 'lyricsplus',
  name: 'LyricsPlus',
  async get(req, { http }) {
    const response = await http({
      url: `https://lyricsplus.binimum.org/v2/lyrics/get?${query({ title: searchTitle(req.title), artist: req.artist, album: req.searched ? undefined : req.album, duration: req.duration > 0 ? Math.round(req.duration) : undefined })}`,
    })
    const data = json(response, 'LyricsPlus')
    if (!data) return null
    // Su búsqueda a veces devuelve otra canción del mismo disco: la duración debe coincidir.
    const theirs = parseTtmlTime(data.metadata?.totalDuration)
    if (req.duration > 0 && theirs && Math.abs(theirs - req.duration) > MATCH_TOLERANCE) return null
    return toResult(parseKpoe(data))
  },
}

const unison = {
  id: 'unison',
  name: 'Unison',
  async get(req, { http }) {
    const params = req.searched || !req.videoId
      ? { song: req.title, artist: req.artist, duration: req.duration > 0 ? Math.round(req.duration) : undefined }
      : { v: req.videoId }
    const data = json(await http({ url: `https://unison.betterlyrics.org/lyrics?${query(params)}` }), 'Unison')
    const lyrics = data?.data?.lyrics
    if (typeof lyrics !== 'string' || !lyrics.trim()) return null
    return data.data.format === 'plain' ? toResult([], lyrics) : toResult(parseAny(lyrics))
  },
}

const netease = {
  id: 'netease',
  name: 'Netease Cloud Music',
  async get(req, { http }) {
    const headers = { Referer: 'https://music.163.com/' }
    // POST: el GET /search/get/web devuelve ahora un blob cifrado.
    const search = json(await http({
      url: 'https://music.163.com/api/search/get',
      method: 'POST',
      headers,
      form: query({ s: `${searchTitle(req.title)} ${mainArtist(req.artist)}`, type: 1, limit: 5, offset: 0 }),
    }), 'Netease')
    const songs = search?.result?.songs ?? []
    const hit = bestByDuration(req.duration, songs, (song) => song.duration / 1000)
    if (!hit?.id) return null
    const data = json(await http({ url: `https://music.163.com/api/song/lyric?id=${hit.id}&lv=1&kv=1&tv=-1`, headers }), 'Netease')
    const lrc = data?.lrc?.lyric
    if (typeof lrc !== 'string' || !lrc.trim()) return null
    // Sin marcas de tiempo es texto plano (p. ej. letras subidas por usuarios).
    return toResult(withoutCredits(parseLrc(lrc)), lrc.replace(/\[[^\]]*\]/g, '').trim())
  },
}

const qq = {
  id: 'qq',
  name: 'QQ Music',
  async get(req, { http }) {
    const headers = { Referer: 'https://y.qq.com/' }
    const found = json(await http({
      url: `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&key=${encodeURIComponent(`${searchTitle(req.title)} ${mainArtist(req.artist)}`)}`,
      headers,
    }), 'QQ')
    const mids = (found?.data?.song?.itemlist ?? []).map((song) => song.mid).filter(Boolean)
    if (!mids.length) return null
    // Las sugerencias no traen duración: una petición agrupada la trae para todas.
    const detail = json(await http({ url: `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?format=json&songmid=${mids.join(',')}`, headers }), 'QQ')
    const hit = bestByDuration(req.duration, detail?.data ?? [], (song) => song.interval)
    if (!hit?.mid) return null
    const data = json(await http({ url: `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${hit.mid}&format=json&nobase64=1`, headers }), 'QQ')
    let raw = typeof data?.lyric === 'string' ? data.lyric : ''
    if (raw && !raw.includes('[')) raw = decodeBase64(raw)
    return raw ? toResult(withoutCredits(parseLrc(raw)), raw.replace(/\[[^\]]*\]/g, '').trim()) : null
  },
}

const kugou = {
  id: 'kugou',
  name: 'Kugou',
  async get(req, { http }) {
    const search = json(await http({
      url: `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(`${searchTitle(req.title)} ${mainArtist(req.artist)}`)}&page=1&pagesize=5`,
    }), 'Kugou')
    const hit = bestByDuration(req.duration, search?.data?.lists ?? [], (song) => song.Duration)
    if (!hit?.FileHash) return null
    const candidates = json(await http({ url: `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&hash=${hit.FileHash}` }), 'Kugou')
    const candidate = candidates?.candidates?.[0]
    if (!candidate?.id || !candidate?.accesskey) return null
    const data = json(await http({
      url: `https://lyrics.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc`,
    }), 'Kugou')
    const raw = decodeBase64(data?.content || '')
    return raw ? toResult(withoutCredits(parseLrc(raw)), raw.replace(/\[[^\]]*\]/g, '').trim()) : null
  },
}

/**
 * Orden predeterminado del modo Automático. Boidu primero: letra oficial de Apple con el idioma original y su
 * romanizado (0,3-0,7 s). LRCLIB arranca a la vez (ver engine.js) y, vía servidor con caché, responde en 50-300 ms:
 * si Boidu no tiene la canción, la letra ya está.
 */
export const PROVIDERS = [boidu, lrclib, lyricsplus, unison, netease, qq, kugou]
export const providerById = (id) => PROVIDERS.find((provider) => provider.id === id) ?? null
