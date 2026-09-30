function parsePayload(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function parseMusicImportResponse(value) {
  const raw = String(value || '').trim()
  const direct = parsePayload(raw)
  if (direct) return direct

  const objectStarts = [0]
  for (let index = raw.indexOf('\n{'); index >= 0; index = raw.indexOf('\n{', index + 2)) {
    objectStarts.push(index + 1)
  }
  for (const start of objectStarts.toReversed()) {
    const payload = parsePayload(raw.slice(start))
    if (payload) return payload
  }

  throw new Error('La automatización devolvió una respuesta ilegible. Revisa el registro de la consola.')
}

function resultMessages(results) {
  return (results || [])
    .filter((result) => result?.reason)
    .map((result) => `${result.file || 'Archivo'}: ${result.reason}`)
}

export function formatMusicImportError(error, fallback) {
  const raw = typeof error === 'string'
    ? error.trim()
    : String(error?.message || error?.error || '').trim()
  if (!raw) return fallback

  if (/webhook .*not registered/i.test(raw)) {
    return 'La automatización de n8n no está publicada. Abre n8n, configura sus credenciales y publica el workflow de Mysic.'
  }
  if (/ECONNREFUSED|Failed to fetch|No se puede establecer una conexión/i.test(raw)) {
    return 'No se pudo conectar con la automatización local. Comprueba que n8n y el worker estén iniciados.'
  }

  const payload = parsePayload(raw)
  if (payload) {
    const messages = resultMessages(payload.results)
    if (messages.length) return messages.join('\n')
    if (payload.error) return String(payload.error)
    if (payload.message) return String(payload.message)
  }

  return raw.replace(/^Error:\s*/i, '') || fallback
}
