const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const { readUiState, addEntries, analyzeEntries, INBOX_ROOT, STATE_PATH } = require('./ui-state')
const { readManifest } = require('./import-music')

const execFileAsync = promisify(execFile)

async function stageFiles(sourcePaths) {
  const root = path.resolve(__dirname, '..', '..')
  const inboxRoot = INBOX_ROOT

  await fs.mkdir(inboxRoot, { recursive: true })

  const entries = []
  for (const sourcePath of sourcePaths) {
    const fileName = path.basename(sourcePath)
    if (!fileName.toLowerCase().endsWith('.mp3')) continue

    let dest = path.join(inboxRoot, fileName)
    if (await fileExists(dest)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      let counter = 1
      do {
        dest = path.join(inboxRoot, `${base} (${counter})${ext}`)
        counter++
      } while (await fileExists(dest))
    }

    await fs.copyFile(sourcePath, dest)
    entries.push({ file: path.basename(dest) })
  }

  const newEntries = await addEntries(entries)
  return newEntries.map((e) => e.file)
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

async function runAnalysisCommand(options = {}) {
  const state = await readUiState()
  const pending = state.entries.filter((e) => e.status === 'pending')

  if (!pending.length) {
    return { analyzed: 0, results: [] }
  }

  const results = await analyzeEntries(
    options.fpcalcPath,
    options.acoustIdApiKey,
    options.fetchJson,
    options.runFpcalc,
    options.wait,
    options.minimumScore,
  )

  return { analyzed: results.length, results }
}

async function generateImportJson() {
  const state = await readUiState()
  const ready = state.entries.filter((e) => e.status === 'ready' && e.cloudinaryFolder)

  const imports = ready.map((e) => ({
    file: e.file,
    metadataSource: 'musicbrainz',
    artist: e.metadata?.artist || undefined,
    title: e.metadata?.title || undefined,
    kind: e.metadata?.kind || undefined,
    releaseName: e.metadata?.album || undefined,
    year: e.metadata?.year || undefined,
    genres: e.metadata?.genres || undefined,
    trackNumber: e.metadata?.trackNumber || undefined,
    musicbrainzRecordingId: e.metadata?.musicbrainzRecordingId || undefined,
    cloudinaryFolder: e.cloudinaryFolder,
  }).filter((v, k, arr) => {
    for (const key of ['artist', 'title', 'kind', 'releaseName', 'trackNumber']) {
      if (!v[key]) {
        arr.splice(k, 1)
        break
      }
    }
    return true
  }))

  const manifestPath = path.join(INBOX_ROOT, 'import.json')
  await fs.mkdir(INBOX_ROOT, { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify({ imports }, null, 2), 'utf8')
  return imports.length
}

async function main() {
  const command = process.argv[2]

  switch (command) {
    case 'stage': {
      const files = process.argv.slice(3)
      if (!files.length) {
        console.error('Uso: node ui-import.js stage <archivo.mp3> [...]')
        process.exit(1)
      }
      const staged = await stageFiles(files)
      console.log(JSON.stringify({ staged }, null, 2))
      break
    }

    case 'analyze': {
      const result = await runAnalysisCommand({
        fpcalcPath: process.env.FPCALC_PATH,
        acoustIdApiKey: process.env.ACOUSTID_API_KEY,
        minimumScore: Number(process.env.ACOUSTID_MIN_SCORE) || 0.85,
      })
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'import-json': {
      const count = await generateImportJson()
      console.log(JSON.stringify({ importEntries: count }, null, 2))
      break
    }

    case 'state': {
      const state = await readUiState()
      console.log(JSON.stringify(state, null, 2))
      break
    }

    default:
      console.error('Uso: node ui-import.js {stage|analyze|import-json|state}')
      process.exit(1)
  }
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }))
  process.exitCode = 1
})

module.exports = { stageFiles, runAnalysisCommand, generateImportJson }
