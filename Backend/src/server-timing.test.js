const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { serverTiming } = require('./server-timing')

async function withServer(app, run) {
  const server = app.listen(0)
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('Server-Timing: tiempo del servidor en la cabecera de cada respuesta, legible desde la app', async () => {
  const app = express()
  app.use(serverTiming())
  app.get('/rapida', (_req, res) => res.json({ ok: true }))
  app.get('/lenta', async (_req, res) => { await new Promise((resolve) => setTimeout(resolve, 60)); res.json({ ok: true }) })
  app.get('/error', (_req, res) => res.status(500).json({ error: 'x' }))
  await withServer(app, async (base) => {
    const fast = await fetch(`${base}/rapida`)
    assert.match(fast.headers.get('server-timing'), /^app;dur=\d+\.\d$/)
    assert.equal(fast.headers.get('timing-allow-origin'), '*')
    const slow = await fetch(`${base}/lenta`)
    const ms = Number(/dur=([\d.]+)/.exec(slow.headers.get('server-timing'))[1])
    assert.ok(ms >= 50 && ms < 2000, `mide la espera del manejador (${ms} ms)`)
    assert.match((await fetch(`${base}/error`)).headers.get('server-timing'), /^app;dur=/)
    assert.equal((await fetch(`${base}/no-existe`)).status, 404, 'no altera el resto de respuestas')
  })
})

test('asyncRoute: un error no se guarda en caché aunque la ruta hubiera puesto Cache-Control público', async () => {
  const { asyncRoute } = await import('./youtube/utils/http.mjs')
  const app = express()
  app.get('/album', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900')
    throw new Error('YouTube no respondió')
  }, 'No se pudo cargar el álbum'))
  app.get('/ok', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json({ ok: true })
  }))
  const silenced = console.error
  console.error = () => {}
  try {
    await withServer(app, async (base) => {
      const failed = await fetch(`${base}/album`)
      assert.equal(failed.status, 500)
      assert.equal(failed.headers.get('cache-control'), 'no-store')
      assert.equal((await fetch(`${base}/ok`)).headers.get('cache-control'), 'public, max-age=300', 'las respuestas buenas conservan su caché')
    })
  } finally {
    console.error = silenced
  }
})
