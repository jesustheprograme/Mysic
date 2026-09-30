const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const test = require('node:test')

const { appendErrorLog, ERROR_LOG } = require('./error-log')

test('registra errores estructurados y redacta secretos', async () => {
  await fs.rm(ERROR_LOG, { force: true })
  await appendErrorLog('test', new Error('fallo controlado'), {
    jobId: 'job-1',
    authorization: 'Bearer secreto',
  })

  const lines = (await fs.readFile(ERROR_LOG, 'utf8')).trim().split(/\r?\n/)
  const entry = JSON.parse(lines.at(-1))
  assert.equal(entry.source, 'test')
  assert.equal(entry.error.message, 'fallo controlado')
  assert.equal(entry.context.jobId, 'job-1')
  assert.equal(entry.context.authorization, '[REDACTED]')
  await fs.rm(ERROR_LOG, { force: true })
})
