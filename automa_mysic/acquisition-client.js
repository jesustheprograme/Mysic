const path = require('node:path')
const { appendErrorLog } = require('./error-log')

function loadConfiguration() {
  require('dotenv').config({ path: path.join(__dirname, '..', 'Backend', '.env'), quiet: true })
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true, override: true })
}

function cleanJobId(value) {
  const id = String(value || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('ID de trabajo no válido.')
  return id
}

async function callN8n(route, options = {}) {
  const baseUrl = String(process.env.MYSIC_N8N_WEBHOOK_BASE || 'http://127.0.0.1:5678/webhook').replace(/\/$/, '')
  const token = process.env.MYSIC_N8N_TOKEN
  if (!token) throw new Error('Falta MYSIC_N8N_TOKEN en automa_mysic/.env.')
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const raw = await response.text()
  let result
  try { result = raw ? JSON.parse(raw) : {} } catch { result = { error: raw } }
  if (!response.ok) throw new Error(result.error || result.message || `n8n respondió HTTP ${response.status}.`)
  return result
}

async function main() {
  loadConfiguration()
  const action = process.argv[2]
  if (action === 'create') {
    const payload = JSON.parse(process.argv[3] || '{}')
    console.log(JSON.stringify(await callN8n('/mysic/acquisition', { method: 'POST', body: payload })))
    return
  }
  const jobId = cleanJobId(process.argv[3])
  if (action === 'status') {
    console.log(JSON.stringify(await callN8n('/mysic/acquisition-status', { method: 'POST', body: { jobId } })))
    return
  }
  if (action === 'cancel') {
    console.log(JSON.stringify(await callN8n('/mysic/acquisition-cancel', { method: 'POST', body: { jobId } })))
    return
  }
  throw new Error('Uso: acquisition-client.js {create|status|cancel}')
}

if (require.main === module) main().catch(async (error) => {
  await appendErrorLog('acquisition-client', error, { action: process.argv[2] }).catch(() => {})
  console.error(error.message)
  process.exitCode = 1
})

module.exports = { callN8n, cleanJobId }
