const fs = require('node:fs/promises')
const path = require('node:path')

const { buildRelativeDestination, buildReleaseFolder } = require('./import-music')
const { primaryArtist } = require('./artist')
const { identifyFromSource, sourceId } = require('./source-metadata')

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

function deriveDestinations(metadata, currentCloudinaryFolder = null) {
  const entry = {
    artist: metadata.artist,
    title: metadata.title,
    kind: metadata.kind,
    releaseName: metadata.album,
    trackNumber: metadata.trackNumber,
  }
  return {
    cloudinaryFolder: currentCloudinaryFolder || buildReleaseFolder(entry),
    remoteDestination: buildRelativeDestination(entry),
  }
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

async function removeEntry(file) {
  const cleanFile = cleanString(file)
  if (!cleanFile || path.basename(cleanFile) !== cleanFile || path.extname(cleanFile).toLowerCase() !== '.mp3') {
    throw new Error('El nombre del MP3 no es válido.')
  }

  const state = await readUiState()
  const entry = state.entries.find((item) => item.file === cleanFile)
  if (!entry) throw new Error(`No se encontro la entrada: ${cleanFile}`)

  await fs.rm(path.join(getInboxRoot(), cleanFile), { force: true })
  state.entries = state.entries.filter((item) => item.file !== cleanFile)
  await writeUiState(state)
  return entry
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
  const picardBatch = await preparePicardBatch(state.entries)

  for (const entry of state.entries) {
    const needsSourceRefresh = entry.status === 'ready'
      && sourceId(entry.file)
      && entry.metadata?.metadataSource !== 'source'
    if ((entry.status === 'ready' && !needsSourceRefresh) || entry.status === 'processed') {
      try {
        let metadata = entry.metadata
        if (entry.metadata?.musicbrainzReleaseId) {
          const { completePicardMetadata } = require('./picard')
          const refreshed = await completePicardMetadata({
            ...entry.metadata,
            releaseName: entry.metadata.album,
          })
          if (refreshed.releaseName !== entry.metadata.album) {
            metadata = { ...entry.metadata, album: refreshed.releaseName }
          }
          if (refreshed.title !== metadata.title) {
            metadata = { ...metadata, title: refreshed.title }
          }
        }
        await updateEntry(entry.file, {
          metadata,
          ...deriveDestinations(metadata, entry.cloudinaryFolder),
        })
      } catch (error) {
        results.push({ file: entry.file, status: 'skipped', reason: `No se pudo actualizar el álbum: ${error.message}` })
        continue
      }
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
        identifiedEntry: picardBatch.get(entry.file),
      })
      await updateEntry(entry.file, {
        status: 'ready',
        metadata: result.metadata,
        ...deriveDestinations(
          result.metadata,
          entry.metadata?.metadataSource === result.metadata.metadataSource ? entry.cloudinaryFolder : null,
        ),
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

  const sourcePath = path.join(getInboxRoot(), file)
  let entry
  if (options.identifiedEntry) {
    if (options.identifiedEntry.error) throw options.identifiedEntry.error
    entry = { file, filePath: sourcePath, ...options.identifiedEntry.metadata }
  } else if (sourceId(file)) {
    try {
      entry = { file, filePath: sourcePath, ...(await identifyFromSource(file)) }
    } catch (sourceError) {
      try {
        entry = await identifyWithConfiguredEngine(file, sourcePath, {
          fpcalcPath, acoustIdApiKey, fetchJson, runFpcalc, wait, minimumScore,
        })
      } catch (fallbackError) {
        throw new Error(`Origen: ${sourceError.message} Respaldo: ${fallbackError.message}`)
      }
    }
  } else {
    entry = await identifyWithConfiguredEngine(file, sourcePath, {
      fpcalcPath, acoustIdApiKey, fetchJson, runFpcalc, wait, minimumScore,
    })
  }

  return {
    metadata: {
      artist: primaryArtist(entry.artist),
      title: entry.title,
      album: entry.releaseName,
      year: entry.year,
      genres: entry.genres,
      trackNumber: entry.trackNumber,
      kind: entry.kind,
      musicbrainzRecordingId: entry.musicbrainzRecordingId,
      musicbrainzReleaseId: entry.musicbrainzReleaseId,
      confidence: entry.confidence,
      metadataSource: entry.metadataSource || 'musicbrainz',
    },
    embeddedCover: false,
  }
}

async function preparePicardBatch(entries) {
  const batch = new Map()
  if (String(process.env.METADATA_ENGINE || '').toLowerCase() !== 'picard') return batch

  const candidates = entries.filter((entry) => (
    !['ready', 'processed'].includes(entry.status) && !sourceId(entry.file)
  ))
  if (!candidates.length) return batch

  const { identifyManyWithPicard } = require('./picard')
  const paths = candidates.map((entry) => path.join(getInboxRoot(), entry.file))
  try {
    const identified = await identifyManyWithPicard(paths)
    for (const result of identified) batch.set(path.basename(result.filePath), result)
  } catch (error) {
    for (const entry of candidates) batch.set(entry.file, { error })
  }
  return batch
}

async function identifyWithConfiguredEngine(file, sourcePath, options) {
  if (String(process.env.METADATA_ENGINE || '').toLowerCase() === 'picard') {
    const { identifyWithPicard } = require('./picard')
    return { file, filePath: sourcePath, ...(await identifyWithPicard(sourcePath)) }
  }

  const { resolveMusicBrainzEntry } = require('./musicbrainz')
  return resolveMusicBrainzEntry(
    { file, filePath: sourcePath },
    options,
  )
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
  removeEntry,
  setEntryStatus,
  analyzeEntries,
  getInboxRoot,
  getStatePath,
}
