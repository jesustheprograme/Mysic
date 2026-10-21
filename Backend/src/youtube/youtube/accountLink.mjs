import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Innertube } from 'youtubei.js';
import database from '../../database.js';

const { getUsersCollection } = database;
const pendingLinks = new Map();
const userClients = new Map();
const KEY_CONTEXT = Buffer.from('mysic-youtube-oauth-v1');

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

export function encryptCredentials(credentials, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptCredentials(encrypted, secret) {
  if (!encrypted || encrypted.version !== 1 || encrypted.algorithm !== 'aes-256-gcm') {
    throw new Error('Formato de credenciales de YouTube Music no compatible.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(encrypted.iv, 'base64'));
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
    { $set: { youtubeMusicAuth: { encrypted: encryptCredentials(credentials), updatedAt: new Date() } } },
  );
}

async function readCredentials(user) {
  const stored = await getUsersCollection().findOne(
    { _id: user._id },
    { projection: { youtubeMusicAuth: 1 } },
  );
  return stored?.youtubeMusicAuth?.encrypted
    ? decryptCredentials(stored.youtubeMusicAuth.encrypted)
    : null;
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

export async function getAccountStatus(user) {
  const key = userKey(user);
  const pending = pendingLinks.get(key);
  if (pending && pending.expiresAt > Date.now()) return publicPending(pending);
  if (pending) pendingLinks.delete(key);

  const credentials = await readCredentials(user);
  return credentials
    ? { connected: true, status: 'connected', method: 'device-oauth' }
    : { connected: false, status: 'disconnected', method: 'anonymous' };
}

export async function startAccountLink(user) {
  const current = await getAccountStatus(user);
  if (current.connected || current.status === 'pending') return current;

  const key = userKey(user);
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
    const expiresAt = Date.now() + Number(payload.expires_in || 900) * 1000;
    const link = {
      client,
      expiresAt,
      interval: Math.max(2, Number(payload.interval || 5)),
      userCode: payload.user_code,
      verificationUrl: payload.verification_url,
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
      userClients.set(key, client);
      pendingLinks.delete(key);
    })
    .catch((error) => {
      pendingLinks.delete(key);
      rejectCode(error);
      console.warn(`Vinculación de YouTube Music cancelada o vencida: ${error.message}`);
    });

  return Promise.race([
    codeReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('YouTube tardó demasiado en iniciar la vinculación.')), 15_000)),
  ]);
}

export async function getYoutubeForUser(user) {
  const key = userKey(user);
  const cached = userClients.get(key);
  if (cached?.session.logged_in) return cached;

  const credentials = await readCredentials(user);
  if (!credentials) return null;

  const client = await Innertube.create();
  watchCredentialUpdates(client, user);
  try {
    await client.session.signIn(credentials);
    userClients.set(key, client);
    return client;
  } catch (error) {
    userClients.delete(key);
    await getUsersCollection().updateOne({ _id: user._id }, { $unset: { youtubeMusicAuth: '' } });
    throw new Error(`La vinculación de YouTube Music dejó de ser válida: ${error.message}`);
  }
}

export async function unlinkAccount(user) {
  const key = userKey(user);
  const client = userClients.get(key) ?? pendingLinks.get(key)?.client;
  pendingLinks.delete(key);
  userClients.delete(key);

  if (client?.session.logged_in) {
    await client.session.signOut().catch((error) => {
      console.warn(`No se pudo revocar el token de YouTube Music: ${error.message}`);
    });
  }
  await getUsersCollection().updateOne({ _id: user._id }, { $unset: { youtubeMusicAuth: '' } });
  return { connected: false, status: 'disconnected', method: 'anonymous' };
}
