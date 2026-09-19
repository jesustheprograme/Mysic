const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { buildDestination, normalizeEntry } = require('./import-music')
const { processEntry } = require('./process-entry')

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-mysic-'))
  const inboxRoot = path.join(root, 'asignar_metadatos')
  const libraryRoot = path.join(root, 'library')
  await fs.mkdir(inboxRoot, { recursive: true })
  const source = path.join(inboxRoot, 'show.mp3')
  await fs.writeFile(source, Buffer.from('fake mp3'))
  return { root, inboxRoot, libraryRoot, source }
}

const entry = normalizeEntry({
  file: 'show.mp3', artist: 'Ado', title: 'Show', kind: 'single', releaseName: 'Show',
  year: 2023, genres: ['J-Pop'], trackNumber: 1, cloudinaryFolder: 'Artistas/Ado/Singles/Show',
})

test('moves a processed MP3 and writes the requested tags', async () => {
  const fixture = await makeFixture()
  const written = []

  const result = await processEntry(entry, {
    ...fixture,
    cover: { secure_url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg' },
    hasEmbeddedCover: async () => false,
    writeTags: async (filePath, tags) => {
      written.push({ filePath, tags })
    },
    downloadCover: async () => Buffer.from('cover'),
  })

  assert.equal(result.status, 'processed')
  assert.equal(await fs.stat(buildDestination(fixture.libraryRoot, entry)).then(() => true), true)
  await assert.rejects(fs.stat(fixture.source))
  assert.equal(written[0].tags.title, 'Show')
  assert.deepEqual(written[0].tags.genres, ['J-Pop'])
  await fs.rm(fixture.root, { recursive: true, force: true })
})

test('does not touch the source when the destination already exists', async () => {
  const fixture = await makeFixture()
  const destination = buildDestination(fixture.libraryRoot, entry)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, Buffer.from('existing'))

  await assert.rejects(
    processEntry(entry, { ...fixture, cover: {}, writeTags: async () => {} }),
    /destino ya existe/,
  )
  assert.equal(await fs.readFile(fixture.source, 'utf8'), 'fake mp3')
  await fs.rm(fixture.root, { recursive: true, force: true })
})
