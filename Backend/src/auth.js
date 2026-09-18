const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { ObjectId } = require('mongodb')
const { OAuth2Client } = require('google-auth-library')
const { z } = require('zod')
const { getUsersCollection } = require('./database')

const SESSION_COOKIE = 'mysic_session'
const SESSION_DURATION = '12h'
const REMEMBERED_SESSION_DURATION = '7d'

const emailSchema = z.string().trim().email('Ingresa un correo electronico valido.').max(254)
const passwordSchema = z.string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres.')
  .max(72, 'La contrasena no puede superar 72 caracteres.')

const registerSchema = z.object({
  username: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(40),
  email: emailSchema,
  password: passwordSchema,
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresa tu contrasena.').max(72),
  remember: z.boolean().optional().default(false),
})

const googleSchema = z.object({
  credential: z.string().min(1, 'Google no devolvio una credencial valida.'),
  remember: z.boolean().optional().default(true),
})

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl || null,
    providers: user.providers || [],
  }
}

function cookieOptions(config, remember = false) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  }
}

function startSession(res, user, config, remember) {
  const token = jwt.sign(
    { sub: user._id.toString() },
    config.jwtSecret,
    { expiresIn: remember ? REMEMBERED_SESSION_DURATION : SESSION_DURATION },
  )

  res.cookie(SESSION_COOKIE, token, cookieOptions(config, remember))
}

function clearSession(res, config) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config))
}

function validationMessage(error) {
  return error.issues?.[0]?.message || 'Revisa los datos enviados.'
}

async function getAuthenticatedUser(req, res, config) {
  const token = req.cookies[SESSION_COOKIE]

  if (!token) {
    res.status(401).json({ message: 'No hay una sesion activa.' })
    return null
  }

  let payload

  try {
    payload = jwt.verify(token, config.jwtSecret)
  } catch {
    clearSession(res, config)
    res.status(401).json({ message: 'La sesion vencio.' })
    return null
  }

  if (!ObjectId.isValid(payload.sub)) {
    clearSession(res, config)
    res.status(401).json({ message: 'La sesion no es valida.' })
    return null
  }

  const user = await getUsersCollection().findOne({ _id: new ObjectId(payload.sub) })

  if (!user) {
    clearSession(res, config)
    res.status(401).json({ message: 'La cuenta ya no existe.' })
    return null
  }

  return user
}

function createAuthHandlers(config) {
  const googleClient = new OAuth2Client()

  async function register(req, res, next) {
    try {
      const parsed = registerSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({ message: validationMessage(parsed.error) })
      }

      const users = getUsersCollection()
      const email = normalizeEmail(parsed.data.email)
      const existingUser = await users.findOne({ email })

      if (existingUser) {
        return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' })
      }

      const now = new Date()
      const user = {
        username: parsed.data.username,
        email,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        providers: ['password'],
        createdAt: now,
        updatedAt: now,
      }

      const result = await users.insertOne(user)
      user._id = result.insertedId
      startSession(res, user, config, false)

      return res.status(201).json({ user: publicUser(user) })
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' })
      }

      return next(error)
    }
  }

  async function login(req, res, next) {
    try {
      const parsed = loginSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({ message: validationMessage(parsed.error) })
      }

      const user = await getUsersCollection().findOne({
        email: normalizeEmail(parsed.data.email),
      })

      if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
        return res.status(401).json({ message: 'Correo o contrasena incorrectos.' })
      }

      startSession(res, user, config, parsed.data.remember)
      return res.json({ user: publicUser(user) })
    } catch (error) {
      return next(error)
    }
  }

  async function google(req, res, next) {
    try {
      if (!config.googleClientId) {
        return res.status(503).json({
          message: 'El acceso con Google todavia no esta configurado en el servidor.',
        })
      }

      const parsed = googleSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({ message: validationMessage(parsed.error) })
      }

      let ticket

      try {
        ticket = await googleClient.verifyIdToken({
          idToken: parsed.data.credential,
          audience: config.googleClientIds?.length ? config.googleClientIds : config.googleClientId,
        })
      } catch {
        return res.status(401).json({ message: 'La credencial de Google vencio o no pertenece a Mysic.' })
      }
      const payload = ticket.getPayload()

      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        return res.status(401).json({ message: 'Google no pudo verificar este correo.' })
      }

      const users = getUsersCollection()
      const email = normalizeEmail(payload.email)
      let user = await users.findOne({ googleSub: payload.sub })

      if (!user) {
        const sameEmailUser = await users.findOne({ email })

        if (sameEmailUser) {
          return res.status(409).json({
            message: 'Ya existe una cuenta con este correo. Inicia sesion con tu contrasena.',
          })
        }

        const now = new Date()
        user = {
          username: payload.name?.trim() || email.split('@')[0],
          email,
          passwordHash: null,
          googleSub: payload.sub,
          avatarUrl: payload.picture || null,
          providers: ['google'],
          createdAt: now,
          updatedAt: now,
        }

        const result = await users.insertOne(user)
        user._id = result.insertedId
      }

      startSession(res, user, config, parsed.data.remember)
      return res.json({ user: publicUser(user) })
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' })
      }

      return next(error)
    }
  }

  async function me(req, res, next) {
    try {
      const user = await getAuthenticatedUser(req, res, config)
      if (!user) return undefined

      return res.json({ user: publicUser(user) })
    } catch (error) {
      return next(error)
    }
  }

  function logout(_req, res) {
    clearSession(res, config)
    return res.status(204).end()
  }

  return { google, login, logout, me, register }
}

module.exports = { createAuthHandlers, getAuthenticatedUser }
