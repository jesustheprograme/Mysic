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

export function parseBrowserAuth(requestText) {
  if (typeof requestText !== 'string' || !requestText.trim()) {
    throw new Error('Pega la solicitud copiada desde YouTube Music.');
  }
  if (Buffer.byteLength(requestText, 'utf8') > MAX_BROWSER_AUTH_LENGTH) {
    throw new Error('La solicitud copiada es demasiado grande.');
  }
  const cookie = normalizeSapisid(findHeader(requestText, 'cookie') || findCurlCookie(requestText));
  if (!/(?:^|;\s*)SAPISID=/i.test(cookie)) {
    throw new Error('La solicitud no contiene una sesión válida de YouTube Music.');
  }
  const rawAccountIndex = findHeader(requestText, 'x-goog-authuser');
  const accountIndex = /^\d+$/.test(rawAccountIndex) ? Number(rawAccountIndex) : 0;
  const onBehalfOfUser = findHeader(requestText, 'x-goog-pageid') || undefined;
  return { cookie, accountIndex, onBehalfOfUser };
}

async function createBrowserClient(browserAuth) {
  return Innertube.create({
    cookie: browserAuth.cookie,
    account_index: browserAuth.accountIndex,
    on_behalf_of_user: browserAuth.onBehalfOfUser,
  });
}

async function verifyMusicPersonalization(client) {
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

  const browserAuth = await readBrowserAuth(user);
  if (browserAuth) {
    try {
      const client = await createBrowserClient(browserAuth);
      await verifyMusicPersonalization(client);
      cacheUserClient(key, client);
      return { connected: true, personalized: true, status: 'connected', method: 'browser-session' };
    } catch {
      await clearBrowserAuth(user);
      return {
        connected: false,
        personalized: false,
        youtubeConnected: Boolean(await readCredentials(user)),
        status: 'error',
        method: 'anonymous',
        error: 'La sesión de YouTube Music venció o fue revocada. Conéctala nuevamente.',
      };
    }
  }
  const credentials = await readCredentials(user);
  return credentials
    ? { connected: false, personalized: false, youtubeConnected: true, status: 'needs-music-session', method: 'device-oauth' }
    : { connected: false, personalized: false, youtubeConnected: false, status: 'disconnected', method: 'anonymous' };
}

export async function connectBrowserSession(user, requestText) {
  const browserAuth = parseBrowserAuth(requestText);
  let client;
  try {
    client = await createBrowserClient(browserAuth);
    await verifyMusicPersonalization(client);
  } catch {
    throw new Error('YouTube Music rechazó esta sesión. Copia una solicitud reciente de music.youtube.com e inténtalo otra vez.');
  }
  await saveBrowserAuth(user, browserAuth);
  cacheUserClient(userKey(user), client);
  return { connected: true, personalized: true, status: 'connected', method: 'browser-session' };
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
  const cached = userClients.get(key);
  if (cached?.session.logged_in) {
    cacheUserClient(key, cached);
    return cached;
  }

  const browserAuth = await readBrowserAuth(user);
  if (browserAuth) {
    try {
      const client = await createBrowserClient(browserAuth);
      cacheUserClient(key, client);
      return client;
    } catch {
      await clearBrowserAuth(user);
    }
  }
  return null;
}

export async function unlinkAccount(user) {
  const key = userKey(user);
  linkTokens.delete(key);
  linkFailures.delete(key);
  const client = userClients.get(key) ?? pendingLinks.get(key)?.client;
  pendingLinks.delete(key);
  userClients.delete(key);

  if (client?.session.logged_in) {
    await client.session.signOut().catch((error) => {
      console.warn(`No se pudo revocar el token de YouTube Music: ${error.message}`);
    });
  }
  await clearCredentials(user);
  return { connected: false, personalized: false, youtubeConnected: false, status: 'disconnected', method: 'anonymous' };
}
