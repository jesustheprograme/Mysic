const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { readManifest, selectCoverForFolder } = require('./import-music')
const { processEntry } = require('./process-entry')

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
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', script, '--', libraryRoot, '--apply'], {
      cwd: path.join(ROOT, '..', 'Backend'),
      env: { ...process.env, MUSIC_LIBRARY_PATH: libraryRoot },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} terminó con código ${code}.`)))
  })
}

async function processImports(options = {}) {
  loadConfiguration()
  const inboxRoot = options.inboxRoot || INBOX_ROOT
  const manifestPath = options.manifestPath || path.join(inboxRoot, 'import.json')
  const libraryRoot = options.libraryRoot || process.env.MUSIC_LIBRARY_PATH || path.join(ROOT, 'biblioteca')
  const dryRun = Boolean(options.dryRun)
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
      const cover = selectCoverForFolder(assets, entry.cloudinaryFolder, folderMode)
      if (dryRun) {
        summary.results.push({ file: entry.file, status: 'ready', cloudinaryFolder: entry.cloudinaryFolder, coverUrl: cover.secure_url })
        continue
      }
      const result = await processEntry(entry, { inboxRoot, libraryRoot, cover, hasEmbeddedCover })
      state.processed = { ...(state.processed || {}), [entry.file]: hash }
      await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
      summary.processed += 1
      summary.results.push({ file: entry.file, ...result })
    } catch (error) {
      summary.failed += 1
      summary.results.push({ file: entry.file, status: 'failed', reason: error.message })
    }
  }

  if (!dryRun && options.syncCatalog && summary.processed > 0) {
    await syncCommand('music:import', libraryRoot)
    await syncCommand('music:cloudinary:apply', libraryRoot)
  }
  return summary
}

async function main() {
  const result = await processImports({
    dryRun: process.argv.includes('--dry-run'),
    syncCatalog: process.argv.includes('--sync-catalog'),
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.failed) process.exitCode = 1
}

if (require.main === module) main().catch((error) => {
  console.error(`No se pudo ejecutar la importación: ${error.message}`)
  process.exitCode = 1
})

module.exports = { processImports }
