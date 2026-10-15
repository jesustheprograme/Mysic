// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/utils/http.js
// Utilidades compartidas por las rutas: validación de IDs, envoltorio de
// errores para handlers asíncronos y comprobación de que YouTube está listo.
import { isYoutubeReady } from '../youtube/client.mjs';

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const BROWSE_ID_RE = /^[A-Za-z0-9_-]{5,64}$/;

/** Convierte excepciones de un handler async en una respuesta 500 con mensaje. */
export function asyncRoute(handler, failureMessage = 'Error interno') {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error(`${failureMessage}:`, error);
      if (!res.headersSent) res.status(500).json({ error: failureMessage, details: error.message });
    }
  };
}

/** Responde 503 mientras Innertube no haya terminado de inicializarse. */
export function requireYoutube(req, res, next) {
  if (!isYoutubeReady()) {
    return res.status(503).json({ error: 'La API todavía se está inicializando. Intenta de nuevo en unos segundos.' });
  }
  next();
}

/** Valida un parámetro de ruta contra una expresión regular. */
export function validateParam(name, pattern, message) {
  return (req, res, next) => {
    if (!pattern.test(String(req.params[name] || ''))) return res.status(400).json({ error: message });
    next();
  };
}
