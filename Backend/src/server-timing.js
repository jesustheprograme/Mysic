/**
 * Cabecera `Server-Timing: app;dur=<ms>` en cada respuesta de la API: el tiempo desde que la petición entra en Express
 * hasta que se envían las cabeceras. Sirve para separar, desde el cliente, lo que tarda el servidor de lo que tarda la
 * red (antes solo se podía medir el total). `Timing-Allow-Origin: *` deja leerla desde la app (solo son tiempos).
 * Sin dependencias: se envuelve `writeHead`, que Express llama una vez por respuesta.
 */
function serverTiming({ now = () => process.hrtime.bigint() } = {}) {
  return function serverTimingMiddleware(_req, res, next) {
    const start = now()
    const writeHead = res.writeHead
    res.writeHead = function timedWriteHead(...args) {
      if (!res.headersSent) {
        const ms = Number(now() - start) / 1e6
        res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`)
        res.setHeader('Timing-Allow-Origin', '*')
      }
      return writeHead.apply(this, args)
    }
    next()
  }
}

module.exports = { serverTiming }
