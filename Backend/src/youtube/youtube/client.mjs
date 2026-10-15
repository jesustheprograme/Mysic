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
    youtube = await Innertube.create();
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
