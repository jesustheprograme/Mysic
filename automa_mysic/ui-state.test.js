const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  readUiState,
  writeUiState,
  addEntries,
  updateEntry,
  getEntry,
  removeEntry,
  setEntryStatus,
} = require('./ui-state')

async function makeState() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-ui-state-'))
  process.env.UI_STATE_DIR = root
  const inbox = path.join(root, 'asignar_metadatos')
  await fs.mkdir(inbox, { recursive: true })
  return { root, inbox, statePath: path.join(inbox, '.ui-state.json') }
}

async function clearState() {
  try {
    const { writeUiState } = require('./ui-state')
    await writeUiState({ entries: [] })
  } catch {
    // ignore
  }
}

test('readUiState returns default state when file missing', async () => {
  const { root } = await makeState()
  try {
    const data = await readUiState()
    assert.deepEqual(data, { entries: [] })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('writeUiState and readUiState round-trip', async () => {
  const { root, statePath } = await makeState()
  try {
    const state = { entries: [{ file: 'test.mp3', status: 'pending' }] }
    await writeUiState(state)
    const read = await readUiState()
    assert.equal(read.entries.length, 1)
    assert.equal(read.entries[0].file, 'test.mp3')
    assert.equal(read.entries[0].status, 'pending')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('addEntries validates and adds MP3 files', async () => {
  const { root, statePath } = await makeState()
  try {
    const entries = await addEntries([
      { file: 'song1.mp3' },
      { file: 'song2.mp3' },
      { file: 'not-a-mp3.txt' },
      { file: 'song1.mp3' }, // duplicate
    ])
    assert.equal(entries.length, 2)
    assert.equal(entries[0].file, 'song1.mp3')
    assert.equal(entries[0].status, 'pending')
    assert.equal(entries[1].file, 'song2.mp3')

    const state = await readUiState()
    assert.equal(state.entries.length, 2)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('updateEntry modifies existing entry', async () => {
  const { root, statePath } = await makeState()
  try {
    await addEntries([{ file: 'song.mp3' }])
    const updated = await updateEntry('song.mp3', { status: 'ready', cloudinaryFolder: 'Artistas/Test' })
    assert.equal(updated.status, 'ready')
    assert.equal(updated.cloudinaryFolder, 'Artistas/Test')

    const error = await updateEntry('missing.mp3', { status: 'ready' }).catch((e) => e)
    assert.ok(error instanceof Error)
    assert.match(error.message, /No se encontro/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('getEntry returns null for missing file', async () => {
  const { root } = await makeState()
  try {
    const entry = await getEntry('nonexistent.mp3')
    assert.equal(entry, null)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('setEntryStatus updates status and metadata', async () => {
  const { root } = await makeState()
  try {
    await addEntries([{ file: 'song.mp3' }])
    const updated = await setEntryStatus('song.mp3', 'ready', { artist: 'Test', title: 'Song' })
    assert.equal(updated.status, 'ready')
    assert.equal(updated.metadata.artist, 'Test')

    const errorEntry = await setEntryStatus('song.mp3', 'error', null, 'fpcalc no encontrado')
    assert.equal(errorEntry.status, 'error')
    assert.equal(errorEntry.error, 'fpcalc no encontrado')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('removeEntry removes the row and its staged MP3', async () => {
  const { root, inbox } = await makeState()
  try {
    await fs.writeFile(path.join(inbox, 'song.mp3'), 'audio')
    await addEntries([{ file: 'song.mp3' }])

    const removed = await removeEntry('song.mp3')
    assert.equal(removed.file, 'song.mp3')
    assert.equal((await readUiState()).entries.some((entry) => entry.file === 'song.mp3'), false)
    await assert.rejects(fs.stat(path.join(inbox, 'song.mp3')), { code: 'ENOENT' })
    await assert.rejects(removeEntry('../song.mp3'), /no es válido/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
