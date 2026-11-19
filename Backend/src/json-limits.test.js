const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { bodyLimitResponse, mountJsonParsers } = require('./json-limits')

test('el cuerpo JSON admite 2 MB solo en /api/playlists y 32 kB en el resto', async () => {
  const app = express()
  mountJsonParsers(app)
  const echo = (req, res) => res.json({ bytes: JSON.stringify(req.body).length })
  app.post('/api/playlists', echo)
  app.patch('/api/playlists/:id', echo)
  app.post('/api/otra-ruta', echo)
  // Mismo manejador que server.js: un cuerpo demasiado grande es 413, no 500.
  app.use((error, _req, res, _next) => {
    const tooLarge = bodyLimitResponse(error)
    if (tooLarge) return res.status(tooLarge.status).json(tooLarge.body)
    return res.status(500).json({ error: 'error' })
  })
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const send = (path, size, method = 'POST') => fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ datos: 'x'.repeat(size) }),
  })
  try {
    // Una playlist de 100 canciones pesa unos 37 kB: antes daba 413.
    assert.equal((await send('/api/playlists', 40 * 1024)).status, 200)
    assert.equal((await send('/api/playlists/abc', 1500 * 1024, 'PATCH')).status, 200, '5.000 canciones caben')
    assert.equal((await send('/api/playlists', 3 * 1024 * 1024)).status, 413, 'pero no sin límite')
    // El resto de rutas conserva los 32 kB.
    assert.equal((await send('/api/otra-ruta', 20 * 1024)).status, 200)
    assert.equal((await send('/api/otra-ruta', 40 * 1024)).status, 413)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('bodyLimitResponse solo reconoce los errores de tamaño de cuerpo', () => {
  assert.deepEqual(bodyLimitResponse({ type: 'entity.too.large', status: 413 }), { body: { message: 'La solicitud es demasiado grande.' }, status: 413 })
  assert.equal(bodyLimitResponse({ status: 413 })?.status, 413)
  assert.equal(bodyLimitResponse({ type: 'entity.parse.failed', status: 400 }), null)
  assert.equal(bodyLimitResponse(new Error('otro')), null)
  assert.equal(bodyLimitResponse(undefined), null)
})
