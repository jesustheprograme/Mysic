const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { formatJapaneseReleaseTitle, formatJapaneseTrackTitle } = require('./release-title')
const { normalizeGenres, selectMusicBrainzGenres } = require('./genres')
const { primaryArtist } = require('./artist')

const execFileAsync = promisify(execFile)
const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const ACOUSTID_ENDPOINT = 'https://api.acoustid.org/v2/lookup'
const USER_AGENT = 'AutomaMysic/1.0 (local music importer)'

function parseFpcalcOutput(output) {
  const parsed = JSON.parse(String(output).trim())
  if (!Number.isFinite(parsed.duration) || !parsed.fingerprint) {
    throw new Error('fpcalc devolvió una huella incompleta.')
  }
  return { duration: parsed.duration, fingerprint: parsed.fingerprint }
}

function chooseAcoustIdResult(payload, minimumScore = 0.85) {
  const candidates = Array.isArray(payload?.results)
    ? payload.results
      .filter((result) => Number.isFinite(result.score) && Array.isArray(result.recordings) && result.recordings.length)
      .sort((left, right) => right.score - left.score)
    : []
  const best = candidates[0]
  if (!best || best.score < minimumScore) {
    throw new Error(`AcoustID no encontró una coincidencia suficientemente confiable (mínimo ${minimumScore}).`)
  }
  return { recordingId: best.recordings[0].id, score: best.score }
}

function artistName(credit) {
  return credit.name || credit.artist?.name || ''
}

function formatArtistCredit(credits = []) {
  return primaryArtist(artistName(credits[0]))
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function releaseDate(release) {
  return String(release?.date || release?.['release-group']?.['first-release-date'] || '')
}

function releaseTrack(release, recordingId) {
  for (const medium of release?.media || []) {
    for (const track of medium.tracks || []) {
      if (track.recording?.id === recordingId) return track
    }
  }
  return null
}

function scoreRelease(release, recordingId, hints = {}) {
  let score = 0
  const releaseGroup = release['release-group'] || {}
  const primaryType = String(releaseGroup['primary-type'] || '').toLowerCase()
  const secondaryTypes = (releaseGroup['secondary-types'] || []).map((type) => String(type).toLowerCase())
  const status = String(release.status || '').toLowerCase()
  const track = releaseTrack(release, recordingId)

  if (hints.album && normalizeText(release.title) === normalizeText(hints.album)) score += 120
  if (hints.year && Number(releaseDate(release).slice(0, 4)) === Number(hints.year)) score += 35
  if (hints.trackNumber && Number(track?.position) === Number(hints.trackNumber)) score += 30
  if (hints.duration && Number(track?.length) > 0) {
    const difference = Math.abs(Number(track.length) / 1000 - Number(hints.duration))
    if (difference <= 2) score += 80
    else if (difference <= 5) score += 35
    else if (difference > 15) score -= 30
  }

  if (status === 'official') score += 30
  if (status === 'promotion') score -= 35
  if (['bootleg', 'pseudo-release', 'withdrawn', 'cancelled'].includes(status)) score -= 60
  if (['album', 'single'].includes(primaryType)) score += 10
  if (secondaryTypes.includes('compilation')) score -= 25
  if (secondaryTypes.includes('soundtrack')) score -= 15
  if (secondaryTypes.some((type) => ['live', 'remix', 'dj-mix'].includes(type))) score -= 30
  return score
}

function selectBestRelease(recording, hints = {}) {
  const releases = Array.isArray(recording.releases) ? recording.releases : []
  if (!releases.length) throw new Error('MusicBrainz no devolvió un lanzamiento para la grabación.')

  return [...releases].sort((left, right) => {
    const scoreDifference = scoreRelease(right, recording.id, hints) - scoreRelease(left, recording.id, hints)
    if (scoreDifference) return scoreDifference
    const leftDate = releaseDate(left) || '9999'
    const rightDate = releaseDate(right) || '9999'
    return leftDate.localeCompare(rightDate) || String(left.id || '').localeCompare(String(right.id || ''))
  })[0]
}

function releaseTrackNumber(release, recordingId) {
  for (const medium of release.media || []) {
    for (const track of medium.tracks || []) {
      if (track.recording?.id === recordingId) return Number(track.position) || 1
    }
  }
  return 1
}

function releaseKind(primaryType) {
  const normalized = String(primaryType || '').toLowerCase()
  if (normalized === 'single') return 'single'
  if (normalized === 'album' || normalized === 'ep') return 'album'
  return null
}

function buildMetadataFromMusicBrainz(recording, options = {}) {
  const release = options.release || selectBestRelease(recording, options.hints)
  const releaseGroup = release['release-group'] || {}
  const primaryType = String(releaseGroup['primary-type'] || '').toLowerCase()
  const genres = selectMusicBrainzGenres(recording, releaseGroup)
  const artist = formatArtistCredit(recording['artist-credit'])
  const recordingId = recording.id

  const metadata = {
    artist,
    title: formatJapaneseTrackTitle(recording.title, {
      recording,
      works: recording.works,
      release,
    }),
    kind: releaseKind(primaryType),
    releaseName: formatJapaneseReleaseTitle(release.title, release),
    year: release.date ? Number(String(release.date).slice(0, 4)) : null,
    genres,
    trackNumber: releaseTrackNumber(release, recordingId),
    musicbrainzRecordingId: recordingId,
    ...(release.id ? { musicbrainzReleaseId: release.id } : {}),
  }
  validateRequiredMetadata(metadata)
  return metadata
}

function validateRequiredMetadata(metadata) {
  const missing = []
  if (!metadata.releaseName || !['album', 'single'].includes(metadata.kind)) missing.push('álbum/single')
  if (!metadata.artist) missing.push('autor(es)')
  if (!metadata.title) missing.push('nombre de la canción')
  if (!Number.isInteger(metadata.year) || metadata.year < 1) missing.push('año')
  if (missing.length) throw new Error(`MusicBrainz no devolvió los metadatos obligatorios: ${missing.join(', ')}.`)
  return metadata
}

async function readFileHints(filePath) {
  try {
    const { parseFile } = require('music-metadata')
    const metadata = await parseFile(filePath, { skipCovers: true, duration: true })
    return {
      album: metadata.common.album || null,
      year: metadata.common.year || null,
      trackNumber: metadata.common.track?.no || null,
      duration: metadata.format.duration || null,
    }
  } catch {
    return {}
  }
}

async function defaultRunFpcalc(fpcalcPath, filePath) {
  const { stdout } = await execFileAsync(fpcalcPath, ['-json', filePath], { maxBuffer: 1024 * 1024 })
  return parseFpcalcOutput(stdout)
}

async function defaultFetchJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`El servicio de identificación respondió HTTP ${response.status}.`)
  return response.json()
}

async function fetchRecordingReleases(recordingId, fetchJson, wait, headers) {
  const releases = []
  let offset = 0
  let total = 1

  while (offset < total) {
    if (offset > 0) await wait(1000)
    const url = new URL(`${MUSICBRAINZ_BASE}/release`)
    url.searchParams.set('fmt', 'json')
    url.searchParams.set('recording', recordingId)
    url.searchParams.set('limit', '100')
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('inc', 'aliases+artist-credits+recordings+release-groups+media')
    const page = await fetchJson(url.href, headers)
    const pageReleases = Array.isArray(page.releases) ? page.releases : []
    releases.push(...pageReleases)
    total = Number(page['release-count']) || pageReleases.length
    if (!pageReleases.length) break
    offset += pageReleases.length
  }
  return releases
}

async function fetchRecordingWorks(recording, fetchJson, wait, headers) {
  const workIds = [...new Set((recording.relations || [])
    .map((relation) => relation.work?.id)
    .filter(Boolean))]
  const works = []
  for (const workId of workIds) {
    await wait(1000)
    works.push(await fetchJson(
      `${MUSICBRAINZ_BASE}/work/${encodeURIComponent(workId)}?fmt=json&inc=aliases`,
      headers,
    ))
  }
  return works
}

async function resolveMusicBrainzEntry(entry, options = {}) {
  const {
    acoustIdApiKey = process.env.ACOUSTID_API_KEY,
    fpcalcPath = process.env.FPCALC_PATH,
    minimumScore = Number(process.env.ACOUSTID_MIN_SCORE) || 0.85,
    runFpcalc = defaultRunFpcalc,
    fetchJson = defaultFetchJson,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    userAgent = process.env.MUSICBRAINZ_USER_AGENT || USER_AGENT,
    readHints = readFileHints,
  } = options

  let recordingId = entry.musicbrainzRecordingId
  let confidence = null
  const hints = { ...(await readHints(entry.filePath)), album: entry.releaseName || undefined, year: entry.year || undefined, trackNumber: entry.trackNumber || undefined }
  if (!recordingId) {
    try {
      if (!fpcalcPath) throw new Error('fpcalc no disponible')
      if (!acoustIdApiKey) throw new Error('AcoustID API key no disponible')
      const fingerprint = await runFpcalc(fpcalcPath, entry.filePath)
      const acoustIdUrl = new URL(ACOUSTID_ENDPOINT)
      acoustIdUrl.searchParams.set('client', acoustIdApiKey)
      acoustIdUrl.searchParams.set('meta', 'recordings+releases+releasegroups+artists+genres+tags')
      acoustIdUrl.searchParams.set('duration', String(Math.round(fingerprint.duration)))
      acoustIdUrl.searchParams.set('fingerprint', fingerprint.fingerprint)
      const match = chooseAcoustIdResult(await fetchJson(acoustIdUrl.href), minimumScore)
      recordingId = match.recordingId
      confidence = match.score
    } catch {
      const tagMetadata = await fallbackFromTags(entry.filePath)
      if (!tagMetadata.artist || !tagMetadata.title) throw new Error('Configura FPCALC_PATH para identificar el MP3 automáticamente.')
      const fallback = {
        ...entry,
        ...tagMetadata,
        kind: tagMetadata.kind,
        musicbrainzRecordingId: null,
        confidence: null,
      }
      validateRequiredMetadata(fallback)
      return fallback
    }
  }

  await wait(1000)
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' }
  const musicbrainzUrl = `${MUSICBRAINZ_BASE}/recording/${encodeURIComponent(recordingId)}?fmt=json&inc=aliases+artist-credits+genres+tags+work-rels`
  const recording = await fetchJson(musicbrainzUrl, headers)
  recording.works = await fetchRecordingWorks(recording, fetchJson, wait, headers)
  await wait(1000)
  recording.releases = await fetchRecordingReleases(recordingId, fetchJson, wait, headers)
  const selectedRelease = selectBestRelease(recording, hints)
  const metadata = buildMetadataFromMusicBrainz(recording, { release: selectedRelease, hints })
  const resolved = {
    ...entry,
    ...metadata,
    artist: entry.artistOverride || metadata.artist,
    title: entry.titleOverride || metadata.title,
    releaseName: entry.releaseNameOverride || metadata.releaseName,
    kind: entry.kindOverride || metadata.kind,
    confidence,
  }
  validateRequiredMetadata(resolved)
  return resolved
}

async function fallbackFromTags(filePath) {
  const { parseFile } = require('music-metadata')
  const metadata = await parseFile(filePath, { skipCovers: true })
  const common = metadata.common
  return {
    artist: primaryArtist(common.artist || common.albumartist),
    title: (common.title || '').trim(),
    releaseName: (common.album || '').trim(),
    year: common.year ? Number(String(common.year).slice(0, 4)) : null,
    genres: normalizeGenres(Array.isArray(common.genre) ? common.genre : (common.genre ? [common.genre] : [])),
    trackNumber: common.track && common.track.no ? Number(common.track.no) : null,
    kind: null,
  }
}

module.exports = {
  buildMetadataFromMusicBrainz,
  chooseAcoustIdResult,
  formatArtistCredit,
  fetchRecordingWorks,
  fetchRecordingReleases,
  parseFpcalcOutput,
  resolveMusicBrainzEntry,
  selectBestRelease,
  validateRequiredMetadata,
}
