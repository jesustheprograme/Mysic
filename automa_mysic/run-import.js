const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { readManifest, selectCoverForFolder } = require('./import-music')
const { processEntry } = require('./process-entry')
const { resolveMusicBrainzEntry } = require('./musicbrainz')
const { getSshConfig, inspectRemoteDestination, uploadRemoteFile } = require('./remote-library')
const { appendErrorLog } = require('./error-log')

const ROOT = __dirname
const INBOX_ROOT = path.join(ROOT, 'asignar_metadatos')

function loadConfiguration() {
  require('dotenv').config({ path: path.join(ROOT, '..', 'Backend', '.env'), quiet: true })
  require('dotenv').config({ path: path.join(ROOT, '..', 'Backend', '.env.cloudinary'), quiet: true, override: true })
}

function entryHash(entry) {
  return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex')
}

async function readState(statePath) {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'))
  } catch {
    return { processed: {} }
  }
}

async function listCloudinaryAssets() {
  loadConfiguration()
  const { listCloudinaryImages } = require('../Backend/scripts/sync-cloudinary-images')
  const folderMode = process.env.CLOUDINARY_FOLDER_MODE?.trim() || 'dynamic'
  return {
    assets: await listCloudinaryImages({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      folderMode,
    }),
    folderMode,
  }
}

async function hasEmbeddedCover(filePath) {
  const { parseFile } = require('music-metadata')
  const metadata = await parseFile(filePath, { skipCovers: false })
  return Array.isArray(metadata.common.picture) && metadata.common.picture.length > 0
}

async function syncCommand(script, libraryRoot) {
  const commands = {
    'music:import': ['import-music.js', libraryRoot, '--apply'],
    'music:cloudinary:apply': ['sync-cloudinary-images.js', '--apply'],
  }
  const command = commands[script]
  if (!command) throw new Error(`Sincronizador desconocido: ${script}.`)
  const [scriptFile, ...args] = command
  await new Promise((resolve, reject) => {
    let diagnosticOutput = ''
    const child = spawn(process.execPath, [path.join(ROOT, '..', 'Backend', 'scripts', scriptFile), ...args], {
      cwd: path.join(ROOT, '..', 'Backend'),
      env: { ...process.env, MUSIC_LIBRARY_PATH: libraryRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const recordDiagnostic = (chunk) => {
      const text = chunk.toString()
      process.stderr.write(text)
      diagnosticOutput = `${diagnosticOutput}${text}`.slice(-20000)
    }
    child.stdout.on('data', recordDiagnostic)
    child.stderr.on('data', recordDiagnostic)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) return resolve()
      const detail = diagnosticOutput.trim()
      reject(new Error(detail || `${script} terminó con código ${code}.`))
    })
  })
}

async function processImports(options = {}) {
  loadConfiguration()
  const inboxRoot = options.inboxRoot || INBOX_ROOT
  const manifestPath = options.manifestPath || path.join(inboxRoot, 'import.json')
  const libraryRoot = options.libraryRoot || process.env.MUSIC_LIBRARY_PATH || path.join(ROOT, 'biblioteca')
  const dryRun = Boolean(options.dryRun)
  const uploadRemote = Boolean(options.uploadRemote)
  const inspectRemote = Boolean(options.inspectRemote)
  const ssh = options.ssh || getSshConfig(options.env || process.env, uploadRemote)
  const entries = await readManifest(manifestPath)
  const statePath = options.statePath || path.join(inboxRoot, '.state.json')
  const state = await readState(statePath)
  const summary = { processed: 0, skipped: 0, failed: 0, results: [] }
  if (!entries.length) return summary

  const assetResult = await (options.listAssets || listCloudinaryAssets)()
  const assets = assetResult.assets || assetResult
  const folderMode = assetResult.folderMode || options.folderMode || 'dynamic'

  for (const entry of entries) {
    const hash = entryHash(entry)
    if (state.processed?.[entry.file] === hash) {
      summary.skipped += 1
      summary.results.push({ file: entry.file, status: 'skipped', reason: 'Ya fue procesado.' })
      continue
    }

    try {
      const sourcePath = path.join(inboxRoot, entry.file)
      const resolvedEntry = entry.metadataSource === 'musicbrainz'
        ? await (options.resolveMetadata || resolveMusicBrainzEntry)({ ...entry, filePath: sourcePath })
        : entry
      if (!resolvedEntry.artist || !resolvedEntry.title || !resolvedEntry.kind || !resolvedEntry.releaseName || !resolvedEntry.year || !resolvedEntry.trackNumber) {
        throw new Error('Faltan metadatos obligatorios después de la identificación: álbum/single, autor(es), canción, año o pista.')
      }
      const cover = selectCoverForFolder(assets, resolvedEntry.cloudinaryFolder, folderMode)
      if (dryRun) {
        const remote = inspectRemote && ssh
          ? await (options.inspectRemoteDestination || inspectRemoteDestination)(resolvedEntry, { ssh })
          : { configured: Boolean(ssh) }
        summary.results.push({
          file: entry.file,
          status: remote.fileExists ? 'conflict' : 'ready',
          artist: resolvedEntry.artist,
          title: resolvedEntry.title,
          releaseName: resolvedEntry.releaseName,
          cloudinaryFolder: resolvedEntry.cloudinaryFolder,
          coverUrl: cover.secure_url,
          remote,
        })
        continue
      }
      const result = await (options.processEntry || processEntry)(resolvedEntry, {
        inboxRoot,
        libraryRoot,
        cover,
        hasEmbeddedCover,
        removeSource: !uploadRemote,
      })
      let remote = null
      if (uploadRemote) {
        try {
          remote = await (options.uploadRemoteFile || uploadRemoteFile)(result.destination, resolvedEntry, { ssh })
          await fs.unlink(result.source)
        } catch (error) {
          await fs.rm(result.destination, { force: true })
          throw error
        }
      }
      state.processed = { ...(state.processed || {}), [entry.file]: hash }
      await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
      summary.processed += 1
      summary.results.push({ file: entry.file, ...result, remote })
    } catch (error) {
      await appendErrorLog('run-import.entry', error, { file: entry.file, dryRun, uploadRemote }).catch(() => {})
      summary.failed += 1
      summary.results.push({ file: entry.file, status: 'failed', reason: error.message })
    }
  }

  if (!dryRun && options.syncCatalog && summary.failed === 0 && summary.processed + summary.skipped > 0) {
    const runSync = options.syncCommand || syncCommand
    await runSync('music:import', libraryRoot)
    await runSync('music:cloudinary:apply', libraryRoot)
  }
  return summary
}

async function main() {
  const result = await processImports({
    dryRun: process.argv.includes('--dry-run'),
    syncCatalog: process.argv.includes('--sync-catalog'),
    uploadRemote: process.argv.includes('--upload-remote'),
    inspectRemote: process.argv.includes('--remote-preview'),
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.failed) process.exitCode = 1
}

if (require.main === module) main().catch(async (error) => {
  await appendErrorLog('run-import', error, { args: process.argv.slice(2) }).catch(() => {})
  console.error(`No se pudo ejecutar la importación: ${error.message}`)
  process.exitCode = 1
})

module.exports = { processImports }
