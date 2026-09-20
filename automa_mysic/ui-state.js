const fs = require('node:fs/promises')
const path = require('node:path')

function getInboxRoot() {
  return path.join(process.env.UI_STATE_DIR || __dirname, 'asignar_metadatos')
}

function getStatePath() {
  return path.join(getInboxRoot(), '.ui-state.json')
}

const DEFAULT_STATE = { entries: [] }

function cleanString(value) {
  return String(value || '').trim()
}

async function readUiState() {
  try {
    const raw = await fs.readFile(getStatePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.entries)) return { ...DEFAULT_STATE, entries: [] }
    return parsed
  } catch {
    return { ...DEFAULT_STATE }
  }
}

async function writeUiState(state) {
  await fs.mkdir(getInboxRoot(), { recursive: true })
  await fs.writeFile(getStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function addEntries(fileEntries) {
  const state = await readUiState()
  const existing = new Set(state.entries.map((e) => e.file))
  const newEntries = []

  for (const raw of fileEntries) {
    const file = cleanString(raw.file)
    if (!file || !file.toLowerCase().endsWith('.mp3')) continue
    if (existing.has(file)) continue

    existing.add(file)
    newEntries.push({
      file,
      status: 'pending',
      metadata: null,
      cloudinaryFolder: null,
      error: null,
      embeddedCover: false,
      lastModified: new Date().toISOString(),
    })
  }

  state.entries.push(...newEntries)
  await writeUiState(state)
  return newEntries
}

async function updateEntry(file, updates) {
  const state = await readUiState()
  const index = state.entries.findIndex((e) => e.file === file)
  if (index < 0) throw new Error(`No se encontro la entrada: ${file}`)

  state.entries[index] = {
    ...state.entries[index],
    ...updates,
    lastModified: new Date().toISOString(),
  }
  await writeUiState(state)
  return state.entries[index]
}

async function getEntry(file) {
  const state = await readUiState()
  return state.entries.find((e) => e.file === file) ?? null
}

async function setEntryStatus(file, status, metadata = null, error = null) {
  const updates = { status, lastModified: new Date().toISOString() }
  if (metadata !== null) updates.metadata = metadata
  if (error !== null) updates.error = error
  return updateEntry(file, updates)
}

async function analyzeEntries(fpcalcPath, acoustIdApiKey, fetchJson, runFpcalc, wait, minimumScore) {
  const state = await readUiState()
  const results = []

  for (const entry of state.entries) {
    if (entry.status === 'ready' || entry.status === 'processed') {
      results.push({ file: entry.file, status: 'skipped', reason: 'Ya tiene metadatos.' })
      continue
    }

    try {
      const result = await runAnalysis(entry.file, {
        fpcalcPath,
        acoustIdApiKey,
        fetchJson,
        runFpcalc,
        wait,
        minimumScore,
      })
      await updateEntry(entry.file, {
        status: 'ready',
        metadata: result.metadata,
        cloudinaryFolder: entry.cloudinaryFolder,
        error: null,
        embeddedCover: result.embeddedCover,
      })
      results.push({ file: entry.file, status: 'ready', metadata: result.metadata })
    } catch (error) {
      await updateEntry(entry.file, {
        status: 'error',
        metadata: null,
        error: error.message,
      })
      results.push({ file: entry.file, status: 'error', reason: error.message })
    }
  }

  return results
}

async function runAnalysis(file, options) {
  const {
    fpcalcPath = process.env.FPCALC_PATH,
    acoustIdApiKey = process.env.ACOUSTID_API_KEY,
    fetchJson = defaultFetchJson,
    runFpcalc = defaultRunFpcalc,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    minimumScore = Number(process.env.ACOUSTID_MIN_SCORE) || 0.85,
  } = options

  const { resolveMusicBrainzEntry } = require('./musicbrainz')

  const sourcePath = path.join(getInboxRoot(), file)
  const entry = await resolveMusicBrainzEntry(
    { file, filePath: sourcePath },
    { fpcalcPath, acoustIdApiKey, fetchJson, runFpcalc, wait, minimumScore },
  )

  return {
    metadata: {
      artist: entry.artist,
      title: entry.title,
      album: entry.releaseName,
      year: entry.year,
      genres: entry.genres,
      trackNumber: entry.trackNumber,
      kind: entry.kind,
      musicbrainzRecordingId: entry.musicbrainzRecordingId,
      confidence: null,
    },
    embeddedCover: false,
  }
}

async function defaultFetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function defaultRunFpcalc(fpcalcPath, filePath) {
  const { execFile } = require('node:child_process')
  const { promisify } = require('node:util')
  const execFileAsync = promisify(execFile)
  const { stdout } = await execFileAsync(fpcalcPath, ['-json', filePath], { maxBuffer: 1024 * 1024 })
  const parsed = JSON.parse(String(stdout).trim())
  if (!Number.isFinite(parsed.duration) || !parsed.fingerprint) {
    throw new Error('fpcalc devolvió una huella incompleta.')
  }
  return { duration: parsed.duration, fingerprint: parsed.fingerprint }
}

module.exports = {
  readUiState,
  writeUiState,
  addEntries,
  updateEntry,
  getEntry,
  setEntryStatus,
  analyzeEntries,
  getInboxRoot,
  getStatePath,
}
