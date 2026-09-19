const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { processImports } = require('./run-import')

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
