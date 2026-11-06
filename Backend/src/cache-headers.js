/**
 * Cabeceras de caché para rutas GET de solo lectura que el código generado de YouTube no marca.
 * Es un middleware externo: no modifica las rutas generadas. `private` evita que una caché
 * compartida guarde respuestas que dependen de la sesión.
 */
function createCacheHeaders({ pattern, maxAgeSeconds, staleSeconds }) {
  const value = `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`
  return function cacheHeaders(req, res, next) {
    if (req.method === 'GET' && pattern.test(req.path)) res.set('Cache-Control', value)
    next()
  }
}

// /artist/:id (la ficha). Las subrutas ya llevan su propia política.
const artistCacheHeaders = createCacheHeaders({
  pattern: /^\/artist\/[^/]+\/?$/,
  maxAgeSeconds: 300,
  staleSeconds: 900,
})

module.exports = { artistCacheHeaders, createCacheHeaders }
