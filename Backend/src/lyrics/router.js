const path = require('node:path')
const express = require('express')
const rateLimit = require('express-rate-limit')
const { createLyricsService } = require('./service')

const MAX_TEXT_LENGTH = 200
const MAX_DURATION_SECONDS = 4 * 60 * 60

function readText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : ''
}

function createLyricsRouter({ service, dataDir } = {}) {
  const lyrics = service ?? createLyricsService({
    cacheDir: path.join(
      dataDir || process.env.LYRICS_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'lyrics'),
    ),
  })
  const router = express.Router()

  router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas consultas de letras. Intenta de nuevo en un minuto.' },
  }))

  router.get('/', async (req, res, next) => {
    const title = readText(req.query.title)
    const artist = readText(req.query.artist)
    const album = readText(req.query.album)
    const duration = Number(req.query.duration)

    if (!title || !artist) {
      return res.status(400).json({ message: 'Indica el título y el artista de la canción.' })
    }
    if (req.query.duration !== undefined
      && (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_SECONDS)) {
      return res.status(400).json({ message: 'La duración no es válida.' })
    }

    try {
      const result = await lyrics.getLyrics({ title, artist, album, duration: duration || 0 })
      res.set('Cache-Control', 'public, max-age=3600')
      return res.json(result)
    } catch (error) {
      // LRCLIB caído o lento: la interfaz debe seguir funcionando sin letra.
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || /LRCLIB/.test(error?.message)) {
        return res.status(503).json({ message: 'El servicio de letras no está disponible ahora.' })
      }
      return next(error)
    }
  })

  return router
}

module.exports = { createLyricsRouter }
