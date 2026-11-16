// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/client.js
// Instancia única de Innertube (youtubei.js). Se inicializa en segundo plano
// después de abrir el puerto y se reintenta si no hay internet.
import { Innertube, Platform } from 'youtubei.js';
import { warmUpPoToken } from './potoken.mjs';

// youtubei.js necesita un evaluador JS para descifrar las URLs de los clientes web.
Platform.shim.eval = async (data, env = {}) =>
  new Function(...Object.keys(env), data.output)(...Object.values(env));

let youtube = null;

function getSessionCookie() {
  const encodedCookie = process.env.YOUTUBE_COOKIE_BASE64?.trim();
  if (encodedCookie) return Buffer.from(encodedCookie, 'base64').toString('utf8').trim();
  return process.env.YOUTUBE_COOKIE?.trim() || undefined;
}

// Idioma y región SOLO si se piden por entorno. Por defecto se queda en inglés de EE. UU.: youtubei.js localiza las
// secciones de los resultados por su título en inglés ("Songs", "Artists"...) y con lang 'es' las búsquedas por tipo
// devuelven listas vacías. Los títulos se traducen en el cliente (shelfTitles.js).
const YOUTUBE_LANG = process.env.YOUTUBE_LANG?.trim() || undefined;
const YOUTUBE_LOCATION = process.env.YOUTUBE_LOCATION?.trim() || undefined;

/** Devuelve la instancia de Innertube o lanza si todavía no está lista. */
export function getYoutube() {
  if (!youtube) throw new Error('Sin conexión con YouTube');
  return youtube;
}

export function isYoutubeReady() {
  return Boolean(youtube);
}

/** Conecta con YouTube y prepara BotGuard; reintenta cada `retryMs` si falla. */
export async function initYoutube(retryMs) {
  try {
    console.log('🔄 Inicializando conexión con YouTube...');
    const cookie = getSessionCookie();
    youtube = await Innertube.create({ ...(YOUTUBE_LANG ? { lang: YOUTUBE_LANG } : {}), ...(YOUTUBE_LOCATION ? { location: YOUTUBE_LOCATION } : {}), ...(cookie ? { cookie } : {}) });
    console.log('✅ Conexión con YouTubei.js completada con éxito.');
  } catch (error) {
    console.error(
      `❌ No se pudo conectar con YouTube (${error.message}). Reintento en ${Math.round(retryMs / 1000)} s; las descargas siguen disponibles.`
    );
    setTimeout(() => initYoutube(retryMs), retryMs).unref();
    return;
  }

  try {
    console.log('🔄 Preparando generador de PO tokens (BotGuard)...');
    await warmUpPoToken();
    console.log('✅ Generador de PO tokens listo.');
  } catch (error) {
    console.warn('⚠️ No se pudo preparar BotGuard; se usará el cliente IOS de respaldo:', error.message);
  }
}
