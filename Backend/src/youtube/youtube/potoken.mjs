// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/potoken.js
// Genera "Proof of Origin tokens" (PO tokens) con BotGuard.
// Sin ellos YouTube corta los streams de audio a ~1 MB con un 403.
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { buildURL, getHeaders, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

let minter = null;
let minterExpiresAt = 0;
let minterPromise = null;

function ensureDom() {
  if (globalThis.window) return;
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    userAgent: USER_AGENT,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
  }
}

async function createMinter() {
  ensureDom();

  const challenge = await getChallenge({ fetchFunction: fetch, requestKey: REQUEST_KEY });
  const interpreterJs = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if (!interpreterJs) throw new Error('BotGuard: no se pudo obtener el intérprete');

  // Carga la máquina virtual de BotGuard en el ámbito global (una vez por desafío)
  new Function(interpreterJs)();

  const botGuardClient = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });

  const webPoSignalOutput = [];
  const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

  const response = await fetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!response.ok) throw new Error(`BotGuard: GenerateIT devolvió ${response.status}`);

  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await response.json();
  if (!integrityToken) throw new Error('BotGuard: no se recibió integrity token');

  const newMinter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput
  );

  // Renovamos con margen: la mitad del TTL que nos da Google (suele ser 12 h)
  const ttlMs = Math.max(10 * 60, (estimatedTtlSecs || 3600) / 2) * 1000;
  return { minter: newMinter, expiresAt: Date.now() + ttlMs };
}

async function getMinter() {
  if (minter && Date.now() < minterExpiresAt) return minter;
  if (!minterPromise) {
    minterPromise = createMinter()
      .then((result) => {
        minter = result.minter;
        minterExpiresAt = result.expiresAt;
        return minter;
      })
      .finally(() => {
        minterPromise = null;
      });
  }
  return minterPromise;
}

/** Devuelve un PO token ligado al ID del vídeo, listo para usar en `po_token` y en `&pot=`. */
export async function mintPoToken(videoId) {
  const m = await getMinter();
  return m.mintAsWebsafeString(videoId);
}

/** Precalienta el generador al arrancar para que la primera canción no espere. */
export async function warmUpPoToken() {
  await getMinter();
}
