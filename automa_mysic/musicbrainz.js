const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

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

function releaseTrackNumber(release, recordingId) {
  for (const medium of release.media || []) {
    for (const track of medium.tracks || []) {
      if (track.recording?.id === recordingId) return Number(track.position) || 1
    }
  }
  return 1
}

function buildMetadataFromMusicBrainz(recording) {
  const release = (recording.releases || [])[0]
  if (!release) throw new Error('MusicBrainz no devolvió un lanzamiento para la grabación.')
  const releaseGroup = release['release-group'] || {}
  const primaryType = String(releaseGroup['primary-type'] || '').toLowerCase()
  const genres = [...new Set([
    ...(recording.genres || []).map((genre) => genre.name),
    ...(recording.tags || []).map((tag) => tag.name),
    ...(releaseGroup.genres || []).map((genre) => genre.name),
  ].filter(Boolean))]
  const credits = (recording['artist-credit'] || []).map(artistName).filter(Boolean)
  const recordingId = recording.id

  return {
    artist: credits.join(', '),
    title: recording.title,
    kind: primaryType === 'single' ? 'single' : 'album',
    releaseName: release.title,
    year: release.date ? Number(String(release.date).slice(0, 4)) : null,
    genres,
    trackNumber: releaseTrackNumber(release, recordingId),
    musicbrainzRecordingId: recordingId,
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

async function resolveMusicBrainzEntry(entry, options = {}) {
  const {
    acoustIdApiKey = process.env.ACOUSTID_API_KEY,
    fpcalcPath = process.env.FPCALC_PATH,
    minimumScore = Number(process.env.ACOUSTID_MIN_SCORE) || 0.85,
    runFpcalc = defaultRunFpcalc,
    fetchJson = defaultFetchJson,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    userAgent = process.env.MUSICBRAINZ_USER_AGENT || USER_AGENT,
  } = options

  let recordingId = entry.musicbrainzRecordingId
  if (!recordingId) {
    if (!fpcalcPath) throw new Error('Configura FPCALC_PATH para identificar el MP3 automáticamente.')
    if (!acoustIdApiKey) throw new Error('Configura ACOUSTID_API_KEY para consultar AcoustID.')
    const fingerprint = await runFpcalc(fpcalcPath, entry.filePath)
    const acoustIdUrl = new URL(ACOUSTID_ENDPOINT)
    acoustIdUrl.searchParams.set('client', acoustIdApiKey)
    acoustIdUrl.searchParams.set('meta', 'recordings+releases+releasegroups+artists+genres+tags')
    acoustIdUrl.searchParams.set('duration', String(Math.round(fingerprint.duration)))
    acoustIdUrl.searchParams.set('fingerprint', fingerprint.fingerprint)
    const match = chooseAcoustIdResult(await fetchJson(acoustIdUrl.href), minimumScore)
    recordingId = match.recordingId
  }

  await wait(1000)
  const musicbrainzUrl = `${MUSICBRAINZ_BASE}/recording/${encodeURIComponent(recordingId)}?fmt=json&inc=artists+releases+release-groups+genres+tags`
  const metadata = buildMetadataFromMusicBrainz(await fetchJson(musicbrainzUrl, { 'User-Agent': userAgent, Accept: 'application/json' }))
  return {
    ...entry,
    ...metadata,
    artist: entry.artistOverride || metadata.artist,
    title: entry.titleOverride || metadata.title,
    releaseName: entry.releaseNameOverride || metadata.releaseName,
    kind: entry.kindOverride || metadata.kind,
  }
}

module.exports = {
  buildMetadataFromMusicBrainz,
  chooseAcoustIdResult,
  parseFpcalcOutput,
  resolveMusicBrainzEntry,
}
