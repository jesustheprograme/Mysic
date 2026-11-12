import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Innertube } from 'youtubei.js';
import database from '../../database.js';

const { getUsersCollection } = database;
const pendingLinks = new Map();
const linkStarts = new Map();
const linkTokens = new Map();
const linkFailures = new Map();
const userClients = new Map();
const KEY_CONTEXT = Buffer.from('mysic-youtube-oauth-v1');
const MAX_USER_CLIENTS = 100;
const MAX_BROWSER_AUTH_LENGTH = 32_768;
// El estado de la cuenta se lee de lo guardado (sin red) y se revalida en segundo plano. Una revalidación que
// falla por red, tiempo agotado o error de YouTube NUNCA borra las credenciales: solo una revocación inequívoca.
const REVALIDATE_OK_MS = 10 * 60 * 1000;
const REVALIDATE_DEGRADED_MS = 60 * 1000;
const VERIFY_TIMEOUT_MS = 20_000;
export const AUTH_HTTP_FAILURE_LIMIT = 3;
export const AUTH_HTTP_FAILURE_MIN_INTERVAL_MS = 30_000;
const accountHealth = new Map();
const revalidations = new Map();
const accountGenerations = new Map();
const accountLocks = new Map();

export class AccountAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccountAuthError';
  }
}

/** ¿El error confirma que YouTube rechazó la sesión (revocada o no autorizada)? Todo lo demás es transitorio. */
export function isAuthRevoked(error) {
  // youtubei.js 18.1.0 devuelve una lista de cuentas vacía para una cookie inválida; verifyMusicPersonalization
  // la convierte en AccountAuthError. Un 401/403 HTTP aislado también puede ser un bloqueo o fallo transitorio y
  // no basta para destruir una sesión guardada.
  return error instanceof AccountAuthError;
}

/** Un 401/403 aislado es ambiguo; se usa únicamente para el contador de fallos consecutivos. */
export function isAuthHttpFailure(error) {
  const status = Number(error?.status ?? error?.status_code ?? error?.info?.status_code ?? error?.response?.status);
  if (status === 401 || status === 403) return true;
  return /(?:status(?: code)?|http)\s*[:=]?\s*(?:401|403)\b/i.test(String(error?.message ?? ''));
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Sustituible en pruebas: así no hace falta red ni base de datos para comprobar la lógica de estados.
export const accountDeps = {
  clearBrowserAuth: (user) => clearBrowserAuth(user),
  clearCredentials: (user) => clearCredentials(user),
  createBrowserClient: (browserAuth) => createBrowserClient(browserAuth),
  now: () => Date.now(),
  readBrowserAuth: (user) => readBrowserAuth(user),
  saveBrowserAuth: (user, browserAuth) => saveBrowserAuth(user, browserAuth),
  verifyMusicPersonalization: (client) => verifyMusicPersonalization(client),
  verifyTimeoutMs: VERIFY_TIMEOUT_MS,
};

function accountGeneration(key) {
  return accountGenerations.get(key) ?? 0;
}

function beginAccountMutation(key) {
  const generation = accountGeneration(key) + 1;
  accountGenerations.set(key, generation);
  return generation;
}

function isCurrentAccountGeneration(key, generation) {
  return accountGeneration(key) === generation;
}

function withAccountLock(key, task) {
  const previous = accountLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  const tail = run.catch(() => {});
  accountLocks.set(key, tail);
  return run.finally(() => {
    if (accountLocks.get(key) === tail) accountLocks.delete(key);
  });
}

async function recordAccountFailure(user, key, generation, error) {
  return withAccountLock(key, async () => {
    if (!isCurrentAccountGeneration(key, generation)) return 'stale';
    const now = accountDeps.now();
    const previous = accountHealth.get(key);
    const repeatedAuthFailure = isAuthHttpFailure(error);
    const lastFailureAt = previous?.authHttpFailureAt;
    const spaced = lastFailureAt == null || now - lastFailureAt >= AUTH_HTTP_FAILURE_MIN_INTERVAL_MS;
    const authHttpFailures = repeatedAuthFailure
      ? (previous?.authHttpFailures ?? 0) + (spaced ? 1 : 0)
      : 0;

    if (repeatedAuthFailure && authHttpFailures >= AUTH_HTTP_FAILURE_LIMIT) {
      await accountDeps.clearBrowserAuth(user);
      if (!isCurrentAccountGeneration(key, generation)) return 'stale';
      accountHealth.set(key, { state: 'expired', checkedAt: now });
      return 'expired';
    }

    accountHealth.set(key, {
      state: 'degraded',
      checkedAt: now,
      ...(repeatedAuthFailure ? {
        authHttpFailureAt: spaced ? now : lastFailureAt,
        authHttpFailures,
      } : {}),
    });
    return 'degraded';
  });
}

function userKey(user) {
  return user._id.toString();
}

function encryptionSecret() {
  const secret = process.env.YOUTUBE_OAUTH_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('Falta una clave para cifrar la vinculación de YouTube Music.');
  return secret;
}

function encryptionKey(secret = encryptionSecret()) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), KEY_CONTEXT, 32));
}

export function encryptCredentials(credentials, secret, ownerId = '') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(ownerId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return {
    version: 2,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptCredentials(encrypted, secret, ownerId = '') {
  if (!encrypted || ![1, 2].includes(encrypted.version) || encrypted.algorithm !== 'aes-256-gcm') {
    throw new Error('Formato de credenciales de YouTube Music no compatible.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(encrypted.iv, 'base64'));
  if (encrypted.version === 2) decipher.setAAD(Buffer.from(ownerId));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const cleartext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(cleartext.toString('utf8'));
}

async function saveCredentials(user, credentials) {
  await getUsersCollection().updateOne(
    { _id: user._id },
    { $set: { youtubeMusicAuth: { encrypted: encryptCredentials(credentials, undefined, userKey(user)), updatedAt: new Date() } } },
  );
}

async function saveBrowserAuth(user, browserAuth) {
  await getUsersCollection().updateOne(
    { _id: user._id },
    { $set: { youtubeMusicBrowserAuth: { encrypted: encryptCredentials(browserAuth, undefined, userKey(user)), updatedAt: new Date() } } },
  );
}

async function clearCredentials(user) {
  await getUsersCollection().updateOne(
    { _id: user._id },
    { $unset: { youtubeMusicAuth: '', youtubeMusicBrowserAuth: '' } },
  );
}

async function readCredentials(user) {
  const stored = await getUsersCollection().findOne(
    { _id: user._id },
    { projection: { youtubeMusicAuth: 1 } },
  );
  if (!stored?.youtubeMusicAuth?.encrypted) return null;
  try {
    return decryptCredentials(stored.youtubeMusicAuth.encrypted, undefined, userKey(user));
  } catch (error) {
    console.warn(`Se descartó una vinculación de YouTube Music ilegible: ${error.message}`);
    await clearCredentials(user);
    return null;
  }
}

async function readBrowserAuth(user) {
  const stored = await getUsersCollection().findOne(
    { _id: user._id },
    { projection: { youtubeMusicBrowserAuth: 1 } },
  );
  if (!stored?.youtubeMusicBrowserAuth?.encrypted) return null;
  try {
    return decryptCredentials(stored.youtubeMusicBrowserAuth.encrypted, undefined, userKey(user));
  } catch (error) {
    console.warn(`Se descartó una sesión de YouTube Music ilegible: ${error.message}`);
    await getUsersCollection().updateOne(
      { _id: user._id },
      { $unset: { youtubeMusicBrowserAuth: '' } },
    );
    return null;
  }
}

async function clearBrowserAuth(user) {
  await getUsersCollection().updateOne(
    { _id: user._id },
    { $unset: { youtubeMusicBrowserAuth: '' } },
  );
  userClients.delete(userKey(user));
}

function unescapeCopiedValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\\(['"])/g, '$1');
}

function findHeader(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:^|\\s)-H\\s+(['"])(?:${escapedName})\\s*:\\s*([\\s\\S]*?)\\1`, 'i'),
    new RegExp(`['"]${escapedName}['"]\\s*:\\s*(['"])([\\s\\S]*?)\\1`, 'i'),
    new RegExp(`(?:^|\\r?\\n)\\s*${escapedName}\\s*:\\s*([^\\r\\n]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return unescapeCopiedValue(match[2] ?? match[1]);
  }
  return '';
}

function findCurlCookie(text) {
  const match = text.match(/(?:^|\s)(?:-b|--cookie)(?:=|\s+)(['"])([\s\S]*?)\1/i);
  return match ? unescapeCopiedValue(match[2]) : '';
}

function normalizeSapisid(cookie) {
  if (/(?:^|;\s*)SAPISID=/i.test(cookie)) return cookie;
  const secureSapisid = cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/i)?.[1];
  return secureSapisid ? `${cookie}; SAPISID=${secureSapisid}` : cookie;
}

function normalizeAccountIndex(value) {
  const accountIndex = Number(value ?? 0);
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex > 99) {
    throw new Error('El selector de cuenta de YouTube Music no es válido.');
  }
  return accountIndex;
}

function normalizeOnBehalfOfUser(value) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new Error('El canal seleccionado de YouTube Music no es válido.');
  }
  return value;
}

export function normalizeBrowserAuth(browserAuth) {
  if (!browserAuth || typeof browserAuth.cookie !== 'string' || !browserAuth.cookie.trim()) {
    throw new Error('YouTube Music no devolvió una sesión válida.');
  }
  if (Buffer.byteLength(browserAuth.cookie, 'utf8') > MAX_BROWSER_AUTH_LENGTH) {
    throw new Error('La sesión de YouTube Music es demasiado grande.');
  }
  if (/[\u0000-\u001F\u007F]/.test(browserAuth.cookie)) {
    throw new Error('La sesión de YouTube Music contiene caracteres no válidos.');
  }

  const cookies = new Map();
  for (const part of browserAuth.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !value) continue;
    cookies.set(name, value);
  }
  const cookie = normalizeSapisid([...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
  if (!/(?:^|;\s*)SAPISID=[^;]+/i.test(cookie)) {
    throw new Error('YouTube Music no devolvió una sesión válida.');
  }
  return {
    cookie,
    accountIndex: normalizeAccountIndex(browserAuth.accountIndex),
    onBehalfOfUser: normalizeOnBehalfOfUser(browserAuth.onBehalfOfUser),
  };
}

export function parseBrowserAuth(requestText) {
  if (typeof requestText !== 'string' || !requestText.trim()) {
    throw new Error('Pega la solicitud copiada desde YouTube Music.');
  }
  if (Buffer.byteLength(requestText, 'utf8') > MAX_BROWSER_AUTH_LENGTH) {
    throw new Error('La solicitud copiada es demasiado grande.');
  }
  const cookie = findHeader(requestText, 'cookie') || findCurlCookie(requestText);
  const rawAccountIndex = findHeader(requestText, 'x-goog-authuser');
  const accountIndex = /^\d+$/.test(rawAccountIndex) ? Number(rawAccountIndex) : 0;
  const onBehalfOfUser = findHeader(requestText, 'x-goog-pageid') || undefined;
  try {
    return normalizeBrowserAuth({ cookie, accountIndex, onBehalfOfUser });
  } catch (error) {
    if (/demasiado grande/.test(error.message)) throw error;
    throw new Error('La solicitud no contiene una sesión válida de YouTube Music.');
  }
}

async function createBrowserClient(browserAuth) {
  return Innertube.create({
    cookie: browserAuth.cookie,
    account_index: browserAuth.accountIndex,
    on_behalf_of_user: browserAuth.onBehalfOfUser,
  });
}

export async function verifyMusicPersonalization(client) {
  // YouTube.js considera iniciada cualquier sesión que tenga una cookie. Consultar
  // la cuenta evita aceptar como válida una cookie inventada, vencida o revocada.
  const accounts = await client.account.getInfo(true);
  if (!Array.isArray(accounts) || !accounts.length) {
    throw new AccountAuthError('YouTube no reconoció una cuenta activa para esta sesión.');
  }
  const home = await client.music.getHomeFeed();
  if (!home?.sections?.length) throw new Error('YouTube Music no devolvió recomendaciones para esta sesión.');
  return home;
}

function watchCredentialUpdates(client, user) {
  client.session.on('update-credentials', ({ credentials }) => {
    void saveCredentials(user, credentials).catch((error) => {
      console.error(`No se pudieron actualizar las credenciales de YouTube Music: ${error.message}`);
    });
  });
}

function publicPending(link) {
  return {
    connected: false,
    status: 'pending',
    userCode: link.userCode,
    verificationUrl: link.verificationUrl,
    expiresAt: link.expiresAt,
    interval: link.interval,
  };
}

function cacheUserClient(key, client) {
  userClients.delete(key);
  userClients.set(key, client);
  if (userClients.size > MAX_USER_CLIENTS) userClients.delete(userClients.keys().next().value);
}

function publicLinkError(error) {
  const reason = error instanceof Error ? error.message : '';
  if (/denied|rechaz|cancel/i.test(reason)) return 'La autorización fue cancelada o rechazada.';
  if (/expired|vencid/i.test(reason)) return 'El código venció. Genera uno nuevo para continuar.';
  return 'No se pudo completar la autorización. Intenta generar un código nuevo.';
}

function expiredPayload() {
  return {
    connected: false,
    personalized: false,
    youtubeConnected: false,
    status: 'error',
    method: 'anonymous',
    expired: true,
    error: 'La sesión de YouTube Music venció o fue revocada. Conéctala nuevamente.',
  };
}

/**
 * Revalida la sesión guardada contra YouTube sin bloquear a nadie. Deduplicada por usuario y con frecuencia
 * limitada. Devuelve el estado resultante ('ok' | 'degraded' | 'expired'); las credenciales solo se borran
 * cuando YouTube las rechaza de forma inequívoca.
 */
export function revalidateAccount(user, { force = false } = {}) {
  const key = userKey(user);
  const generation = accountGeneration(key);
  const running = revalidations.get(key);
  if (running?.generation === generation) return running.promise;

  const health = accountHealth.get(key);
  const age = health ? accountDeps.now() - health.checkedAt : Infinity;
  const interval = health?.state === 'degraded' ? REVALIDATE_DEGRADED_MS : REVALIDATE_OK_MS;
  if (!force && health && age < interval) return Promise.resolve(health.state);

  const run = (async () => {
    try {
      const browserAuth = await accountDeps.readBrowserAuth(user);
      if (!browserAuth) return 'ok';
      const client = await withTimeout(accountDeps.createBrowserClient(browserAuth), accountDeps.verifyTimeoutMs, 'YouTube tardó demasiado en responder.');
      await withTimeout(accountDeps.verifyMusicPersonalization(client), accountDeps.verifyTimeoutMs, 'YouTube tardó demasiado en responder.');
      return withAccountLock(key, async () => {
        if (!isCurrentAccountGeneration(key, generation)) return 'stale';
        cacheUserClient(key, client);
        accountHealth.set(key, { state: 'ok', checkedAt: accountDeps.now() });
        return 'ok';
      });
    } catch (error) {
      if (isAuthRevoked(error)) {
        return withAccountLock(key, async () => {
          if (!isCurrentAccountGeneration(key, generation)) return 'stale';
          await accountDeps.clearBrowserAuth(user);
          if (!isCurrentAccountGeneration(key, generation)) return 'stale';
          accountHealth.set(key, { state: 'expired', checkedAt: accountDeps.now() });
          return 'expired';
        });
      }
      console.warn(`No se pudo revalidar la sesión de YouTube Music (se conserva): ${error.message}`);
      return recordAccountFailure(user, key, generation, error);
    }
  })().finally(() => {
    if (revalidations.get(key)?.promise === run) revalidations.delete(key);
  });
  revalidations.set(key, { generation, promise: run });
  return run;
}

/** ¿Hay una sesión de navegador guardada para este usuario (sin consultar a YouTube)? */
export async function hasStoredBrowserAuth(user) {
  return Boolean(await accountDeps.readBrowserAuth(user));
}

/** Estado de la cuenta. Lectura rápida de lo guardado; `health` indica qué se sabe de su vigencia. */
export async function getAccountStatus(user) {
  const key = userKey(user);
  const pending = pendingLinks.get(key);
  if (pending && pending.expiresAt > Date.now()) return publicPending(pending);
  if (pending) pendingLinks.delete(key);
  const failure = linkFailures.get(key);
  if (failure?.expiresAt > Date.now()) {
    return { connected: false, status: 'error', method: 'anonymous', error: failure.message };
  }
  if (failure) linkFailures.delete(key);

  if (accountHealth.get(key)?.state === 'expired') return expiredPayload();

  const browserAuth = await accountDeps.readBrowserAuth(user);
  if (browserAuth) {
    void revalidateAccount(user);
    return {
      connected: true,
      personalized: true,
      status: 'connected',
      method: 'browser-session',
      health: accountHealth.get(key)?.state ?? 'unverified',
    };
  }
  const credentials = await readCredentials(user);
  return credentials
    ? { connected: false, personalized: false, youtubeConnected: true, status: 'needs-music-session', method: 'device-oauth' }
    : { connected: false, personalized: false, youtubeConnected: false, status: 'disconnected', method: 'anonymous' };
}
async function connectValidatedBrowserSession(user, browserAuth) {
  const key = userKey(user);
  const generation = beginAccountMutation(key);
  let client;
  try {
    client = await accountDeps.createBrowserClient(browserAuth);
    await accountDeps.verifyMusicPersonalization(client);
  } catch {
    throw new Error('YouTube Music rechazó esta sesión. Copia una solicitud reciente de music.youtube.com e inténtalo otra vez.');
  }
  return withAccountLock(key, async () => {
    if (!isCurrentAccountGeneration(key, generation)) {
      throw new Error('La vinculación cambió mientras se validaba. Inténtalo nuevamente.');
    }
    await accountDeps.saveBrowserAuth(user, browserAuth);
    if (!isCurrentAccountGeneration(key, generation)) {
      throw new Error('La vinculación cambió mientras se guardaba. Inténtalo nuevamente.');
    }
    accountHealth.set(key, { state: 'ok', checkedAt: accountDeps.now() });
    cacheUserClient(key, client);
    return { connected: true, personalized: true, status: 'connected', method: 'browser-session' };
  });
}

export async function connectBrowserSession(user, requestText) {
  return connectValidatedBrowserSession(user, parseBrowserAuth(requestText));
}

export async function connectCapturedBrowserSession(user, browserAuth) {
  return connectValidatedBrowserSession(user, normalizeBrowserAuth(browserAuth));
}

export function validateVerificationUrl(value) {
  const url = new URL(value);
  const trustedHost = url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com');
  if (url.protocol !== 'https:' || !trustedHost) {
    throw new Error('YouTube devolvió una dirección de activación no válida.');
  }
  return url.toString();
}

async function beginAccountLink(user, token) {
  const current = await getAccountStatus(user);
  if (current.connected || current.status === 'pending') return current;

  const key = userKey(user);
  linkFailures.delete(key);
  const client = await Innertube.create();
  watchCredentialUpdates(client, user);

  let resolveCode;
  let rejectCode;
  const codeReady = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  let receivedCredentials;

  client.session.once('auth-pending', (payload) => {
    if (linkTokens.get(key) !== token) throw new Error('La vinculación fue cancelada.');
    const expiresAt = Date.now() + Number(payload.expires_in || 900) * 1000;
    const link = {
      client,
      expiresAt,
      interval: Math.max(2, Number(payload.interval || 5)),
      userCode: payload.user_code,
      verificationUrl: validateVerificationUrl(payload.verification_url),
    };
    pendingLinks.set(key, link);
    resolveCode(publicPending(link));
  });
  client.session.once('auth', ({ credentials }) => {
    receivedCredentials = credentials;
  });

  void client.session.signIn()
    .then(async () => {
      if (pendingLinks.get(key)?.client !== client) {
        await client.session.signOut().catch(() => {});
        return;
      }
      const credentials = receivedCredentials ?? client.session.oauth?.oauth2_tokens;
      if (!credentials) throw new Error('YouTube no devolvió credenciales válidas.');
      await saveCredentials(user, credentials);
      pendingLinks.delete(key);
    })
    .catch((error) => {
      pendingLinks.delete(key);
      linkFailures.set(key, { message: publicLinkError(error), expiresAt: Date.now() + 60_000 });
      rejectCode(error);
      console.warn(`Vinculación de YouTube Music cancelada o vencida: ${error.message}`);
    });

  return Promise.race([
    codeReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('YouTube tardó demasiado en iniciar la vinculación.')), 15_000)),
  ]);
}

export function startAccountLink(user) {
  const key = userKey(user);
  const currentStart = linkStarts.get(key);
  if (currentStart) return currentStart;

  const token = Symbol(key);
  linkTokens.set(key, token);
  let start;
  start = beginAccountLink(user, token).finally(() => {
    if (linkStarts.get(key) === start) linkStarts.delete(key);
    if (linkTokens.get(key) === token) linkTokens.delete(key);
  });
  linkStarts.set(key, start);
  return start;
}

export async function getYoutubeForUser(user) {
  const key = userKey(user);
  const generation = accountGeneration(key);
  const cached = userClients.get(key);
  if (cached?.session.logged_in) {
    cacheUserClient(key, cached);
    return cached;
  }

  const browserAuth = await accountDeps.readBrowserAuth(user);
  if (browserAuth) {
    try {
      const client = await accountDeps.createBrowserClient(browserAuth);
      if (!isCurrentAccountGeneration(key, generation)) return null;
      cacheUserClient(key, client);
      return client;
    } catch (error) {
      // Sin red o con YouTube caído la sesión sigue siendo buena: solo se borra si YouTube la rechaza.
      if (isAuthRevoked(error)) {
        await withAccountLock(key, async () => {
          if (!isCurrentAccountGeneration(key, generation)) return;
          await accountDeps.clearBrowserAuth(user);
          if (isCurrentAccountGeneration(key, generation)) {
            accountHealth.set(key, { state: 'expired', checkedAt: accountDeps.now() });
          }
        });
      } else {
        console.warn(`No se pudo crear el cliente de YouTube Music (se conserva la sesión): ${error.message}`);
        await recordAccountFailure(user, key, generation, error);
      }
    }
  }
  return null;
}

export async function unlinkAccount(user) {
  const key = userKey(user);
  const generation = beginAccountMutation(key);
  linkTokens.delete(key);
  linkFailures.delete(key);
  const client = userClients.get(key) ?? pendingLinks.get(key)?.client;
  pendingLinks.delete(key);
  userClients.delete(key);

  // Se borra dentro de la misma cola que el guardado de una nueva vinculación: ninguna operación tardía puede
  // volver a publicar el cliente o las credenciales de la cuenta anterior después de esta petición.
  await withAccountLock(key, async () => {
    await accountDeps.clearCredentials(user);
    if (isCurrentAccountGeneration(key, generation)) accountHealth.delete(key);
  });

  if (client?.session.logged_in) {
    await client.session.signOut().catch((error) => {
      console.warn(`No se pudo revocar el token de YouTube Music: ${error.message}`);
    });
  }
  return { connected: false, personalized: false, youtubeConnected: false, status: 'disconnected', method: 'anonymous' };
}
