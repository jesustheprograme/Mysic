const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { getSshConfig, inspectRemoteDestination, uploadRemoteFile } = require('./remote-library')

const entry = {
  artist: 'Ado',
  title: 'Show',
  kind: 'single',
  releaseName: 'Show',
  trackNumber: 1,
}

const ssh = {
  host: 'music.example.com',
  user: 'ubuntu',
  keyPath: 'C:\\keys\\music.key',
  root: '/music',
}

test('treats an incomplete SSH configuration as unavailable for previews', () => {
  assert.equal(getSshConfig({}, false), null)
  assert.throws(() => getSshConfig({}, true), /MUSIC_SSH_HOST/)
})

test('inspects the exact remote destination without changing it', async () => {
  let command = ''
  const result = await inspectRemoteDestination(entry, {
    ssh,
    executeSsh: async (_ssh, value) => {
      command = value
      return 'directory=1\nfile=0\n'
    },
  })

  assert.equal(result.destination, '/music/Artistas/Ado/Singles/Show/01 - Show.mp3')
  assert.equal(result.directoryExists, true)
  assert.equal(result.fileExists, false)
  assert.match(command, /if \[ -e/)
})

test('uploads through a temporary file and verifies SHA-256', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-remote-'))
  const localFile = path.join(root, 'show.mp3')
  await fs.writeFile(localFile, 'audio')
  let command = ''

  const result = await uploadRemoteFile(localFile, entry, {
    ssh,
    streamFile: async (_file, _ssh, value) => { command = value },
  })

  assert.equal(result.destination, '/music/Artistas/Ado/Singles/Show/01 - Show.mp3')
  assert.match(command, /sha256sum/)
  assert.match(command, /\.part/)
  assert.match(command, /exit 73/)
  await fs.rm(root, { recursive: true, force: true })
})
