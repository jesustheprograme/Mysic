/**
 * Caché de respuestas JSON por usuario para rutas GET lentas y personalizadas
 * (p. ej. /api/youtube/home). Es un middleware externo: no modifica las rutas.
 *
 * - Solo guarda respuestas 200; un 503 (YouTube arrancando) nunca se fija.
 * - Una petición simultánea idéntica no se deduplica aquí; el valor lo aporta el TTL.
 * - Las respuestas servidas desde caché llevan `X-Mysic-Cache: HIT`.
 */
function createResponseCache({ ttlMs, maxUsers = 100, maxPerUser = 8, now = Date.now, userKey } = {}) {
  if (!(ttlMs > 0)) throw new Error('ttlMs debe ser un número positivo.')
  const resolveUser = userKey ?? ((req) => req.mysicUser?._id?.toString())
  const users = new Map()

  function entriesFor(userId) {
    let entries = users.get(userId)
    if (entries) {
      users.delete(userId)
    } else {
      entries = new Map()
    }
    users.set(userId, entries)
    while (users.size > maxUsers) users.delete(users.keys().next().value)
    return entries
  }

  function middleware(req, res, next) {
    const userId = req.method === 'GET' ? resolveUser(req) : null
    if (!userId) return next()

    const entries = entriesFor(userId)
    const key = req.originalUrl
    const hit = entries.get(key)
    if (hit && now() < hit.expiresAt) {
      res.set('X-Mysic-Cache', 'HIT')
      res.set('Cache-Control', 'private, no-store')
      return res.status(200).json(hit.body)
    }
    entries.delete(key)

    const send = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode === 200) {
        entries.set(key, { body, expiresAt: now() + ttlMs })
        while (entries.size > maxPerUser) entries.delete(entries.keys().next().value)
      }
      return send(body)
    }
    return next()
  }

  /** Descarta todo lo guardado de un usuario (p. ej. al vincular o desvincular su cuenta). */
  function invalidate(userId) {
    if (userId) users.delete(String(userId))
  }

  function invalidateOnWrite(req, _res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') invalidate(resolveUser(req))
    next()
  }

  return { invalidate, invalidateOnWrite, middleware }
}

module.exports = { createResponseCache }
