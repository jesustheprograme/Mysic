const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { processImports } = require('./run-import')
const { normalizeEntry } = require('./import-music')

test('returns a no-op summary for an empty manifest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-mysic-run-'))
  const inboxRoot = path.join(root, 'asignar_metadatos')
  await fs.mkdir(inboxRoot, { recursive: true })
  await fs.writeFile(path.join(inboxRoot, 'import.json'), JSON.stringify({ imports: [] }))

  const result = await processImports({
    inboxRoot,
    libraryRoot: path.join(root, 'library'),
    listAssets: async () => { throw new Error('no debe llamar Cloudinary') },
  })

  assert.deepEqual(result, { processed: 0, skipped: 0, failed: 0, results: [] })
  await fs.rm(root, { recursive: true, force: true })
})

test('removes the new local copy but retains the inbox MP3 when remote upload fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-mysic-remote-failure-'))
  const inboxRoot = path.join(root, 'asignar_metadatos')
  const libraryRoot = path.join(root, 'library')
  const source = path.join(inboxRoot, 'show.mp3')
  const destination = path.join(libraryRoot, 'Artistas', 'Ado', 'Singles', 'Show', '01 - Show.mp3')
  await fs.mkdir(inboxRoot, { recursive: true })
  await fs.writeFile(source, 'audio')
  await fs.writeFile(path.join(inboxRoot, 'import.json'), JSON.stringify({
    imports: [{
      file: 'show.mp3', metadataSource: 'manual', artist: 'Ado', title: 'Show', kind: 'single',
      releaseName: 'Show', year: 2023, trackNumber: 1, cloudinaryFolder: 'Artistas/Ado/Singles/Show',
    }],
  }))

  const result = await processImports({
    inboxRoot,
    libraryRoot,
    uploadRemote: true,
    ssh: { host: 'example.com', user: 'ubuntu', keyPath: 'key', root: '/music' },
    listAssets: async () => [{
      asset_folder: 'Artistas/Ado/Singles/Show', display_name: 'cover', format: 'jpg',
      secure_url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
    }],
    processEntry: async (_entry, dependencies) => {
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(source, destination)
      assert.equal(dependencies.removeSource, false)
      return { status: 'processed', source, destination, coverUrl: null }
    },
    uploadRemoteFile: async () => { throw new Error('servidor no disponible') },
  })

  assert.equal(result.failed, 1)
  assert.equal(await fs.readFile(source, 'utf8'), 'audio')
  await assert.rejects(fs.stat(destination))
  await fs.rm(root, { recursive: true, force: true })
})

test('synchronizes the catalog when an already processed entry is retried', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-mysic-resync-'))
  const inboxRoot = path.join(root, 'asignar_metadatos')
  const rawEntry = {
    file: 'show.mp3', metadataSource: 'manual', artist: 'Ado', title: 'Show', kind: 'single',
    releaseName: 'Show', year: 2023, trackNumber: 1, cloudinaryFolder: 'Artistas/Ado/Singles/Show',
  }
  const normalized = normalizeEntry(rawEntry)
  const hash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  await fs.mkdir(inboxRoot, { recursive: true })
  await fs.writeFile(path.join(inboxRoot, 'import.json'), JSON.stringify({ imports: [rawEntry] }))
  await fs.writeFile(path.join(inboxRoot, '.state.json'), JSON.stringify({ processed: { 'show.mp3': hash } }))
  const synchronized = []

  const result = await processImports({
    inboxRoot,
    libraryRoot: path.join(root, 'library'),
    syncCatalog: true,
    syncCommand: async (script) => synchronized.push(script),
  })

  assert.equal(result.skipped, 1)
  assert.deepEqual(synchronized, ['music:import', 'music:cloudinary:apply'])
  await fs.rm(root, { recursive: true, force: true })
})
