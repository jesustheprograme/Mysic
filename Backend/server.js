const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({
  path: path.join(__dirname, 'private', 'mongodb.env'),
  quiet: true,
})
dotenv.config({
  path: path.join(__dirname, '.env.cloudinary'),
  quiet: true,
})
dotenv.config({
  path: path.join(__dirname, '.env'),
  override: true,
  quiet: true,
})
const runtimeEnvFile = process.env.MYSIC_RUNTIME_ENV?.trim()
if (runtimeEnvFile) {
  dotenv.config({ path: runtimeEnvFile, override: true, quiet: true })
}
const cookieParser = require('cookie-parser')
const cors = require('cors')
const express = require('express')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const morgan = require('morgan')
const { createAuthHandlers, getAuthenticatedUser } = require('./src/auth')
const { createCatalogRouter } = require('./src/catalog')
const { createFavoritesRouter } = require('./src/favorites')
const { createPlaylistsRouter } = require('./src/playlists')
const { getConfig } = require('./src/config')
const { checkDatabaseHealth, closeDatabase, connectDatabase } = require('./src/database')
const { checkPrismaHealth, closePrisma, connectPrisma } = require('./src/prisma')
const { YOUTUBE_USER_PATHS } = require('./src/youtube/authPaths')

const app = express()
let server

const tracks = [
  { id: 1, title: 'Noche en casa', artist: 'Biblioteca personal', duration: '3:42' },
  { id: 2, title: 'Ruta tranquila', artist: 'Biblioteca personal', duration: '4:10' },
  { id: 3, title: 'Sesion privada', artist: 'Biblioteca personal', duration: '2:58' },
]

function isPrivateNetworkOrigin(origin) {
  if (!origin) return false

  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:') return false

    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname.startsWith('10.')
      || hostname.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  } catch {
    return false
  }
}

function isTauriOrigin(origin) {
  if (!origin) return false

  try {
    const { hostname, protocol } = new URL(origin)
    return hostname === 'tauri.localhost' && ['http:', 'https:', 'tauri:'].includes(protocol)
  } catch {
    return false
  }
}

async function start() {
  const config = getConfig()
  const auth = createAuthHandlers(config)

  await Promise.all([connectDatabase(config), connectPrisma()])

  if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://www.youtube.com'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      },
    },
  }))
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin) || isTauriOrigin(origin) || (config.nodeEnv !== 'production' && isPrivateNetworkOrigin(origin))) {
        return callback(null, true)
      }

      return callback(new Error('Origen no permitido por CORS.'))
    },
  }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '32kb' }))
  app.use(cookieParser())

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' },
  })

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ status: 'ok', service: 'mysic-api' })
  })

  app.get('/api/health/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      await Promise.all([checkDatabaseHealth(), checkPrismaHealth()])
      return res.json({ status: 'ready', service: 'mysic-api' })
    } catch (error) {
      console.error(`Readiness check failed: ${error.message}`)
      return res.status(503).json({ status: 'unavailable', service: 'mysic-api' })
    }
  })

  app.get('/api/tracks', (_req, res) => {
    res.json(tracks)
  })

  app.use('/api/catalog', createCatalogRouter(config))
  app.use('/api/favorites', createFavoritesRouter(config))
  app.use('/api/playlists', createPlaylistsRouter(config))

  // Los feeds personales nunca se exponen sin una sesión válida de Mysic.
  app.use(
    YOUTUBE_USER_PATHS,
    async (req, res, next) => {
      try {
        const user = await getAuthenticatedUser(req, res, config)
        if (user) {
          req.mysicUser = user
          next()
        }
      } catch (error) {
        next(error)
      }
    },
  )

  // YouTube Music (Yotubei). Código en src/youtube (ESM, generado).
  const { createApiRouter: createYoutubeRouter } = await import('./src/youtube/routes/index.mjs')
  app.use('/api/youtube', createYoutubeRouter())

  app.post('/api/auth/register', authLimiter, auth.register)
  app.post('/api/auth/login', authLimiter, auth.login)
  app.post('/api/auth/google', authLimiter, auth.google)
  app.get('/api/auth/me', auth.me)
  app.post('/api/auth/logout', auth.logout)

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Ruta de API no encontrada.' })
  })

  app.use((error, _req, res, _next) => {
    console.error(error)
    if (error?.type === 'entity.parse.failed' || error?.status === 400) {
      return res.status(400).json({ message: 'La solicitud no tiene un formato valido.' })
    }

    return res.status(500).json({ message: 'Ocurrio un error inesperado en el servidor.' })
  })

  server = app.listen(config.port, config.bindHost, () => {
    console.log(`Mysic API running on http://${config.bindHost}:${config.port}`)
    // Yotubei: hilos de comparación de imágenes y conexión con YouTube (reintenta sola si no hay internet)
    import('./src/youtube/services/similarityPool.mjs').then(({ warmSimilarityPool }) => warmSimilarityPool())
    import('./src/youtube/youtube/client.mjs').then(({ initYoutube }) => initYoutube(30_000))
  })
}

async function shutdown() {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }

  await closeDatabase()
  await closePrisma()
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`No se pudo iniciar Mysic API: ${error.message}`)
    process.exitCode = 1
  })

  process.on('SIGINT', () => shutdown().finally(() => process.exit(0)))
  process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)))
}

module.exports = { app, start }
