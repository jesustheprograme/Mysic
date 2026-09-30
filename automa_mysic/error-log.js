const fs = require('node:fs/promises')
const path = require('node:path')

const LOG_ROOT = path.join(__dirname, '..', 'logs')
const ERROR_LOG = path.join(LOG_ROOT, 'mysic-errors.jsonl')

function cleanDetails(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (
    /authorization|token|secret|password/i.test(key)
      ? [key, '[REDACTED]']
      : [key, cleanDetails(item)]
  )))
}

async function appendErrorLog(source, error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    error: cleanDetails(error),
    context: cleanDetails(context),
  }
  await fs.mkdir(LOG_ROOT, { recursive: true })
  await fs.appendFile(ERROR_LOG, `${JSON.stringify(entry)}\n`, 'utf8')
  return entry
}

module.exports = { appendErrorLog, ERROR_LOG }
