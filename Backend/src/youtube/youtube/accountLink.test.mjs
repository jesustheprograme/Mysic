import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountAuthError,
  AUTH_HTTP_FAILURE_MIN_INTERVAL_MS,
  accountDeps,
  connectCapturedBrowserSession,
  decryptCredentials,
  encryptCredentials,
  getAccountStatus,
  getYoutubeForUser,
  isAuthHttpFailure,
  isAuthRevoked,
  normalizeBrowserAuth,
  parseBrowserAuth,
  revalidateAccount,
  unlinkAccount,
  validateVerificationUrl,
  verifyMusicPersonalization,
} from './accountLink.mjs';

test('cifra y descifra credenciales de YouTube Music sin exponer el contenido', () => {
  const credentials = { access_token: 'token-secreto', refresh_token: 'refresh-secreto', expiry_date: '2030-01-01' };
  const encrypted = encryptCredentials(credentials, 'clave-de-prueba-muy-larga', 'usuario-1');

  assert.equal(JSON.stringify(encrypted).includes('token-secreto'), false);
  assert.deepEqual(decryptCredentials(encrypted, 'clave-de-prueba-muy-larga', 'usuario-1'), credentials);
});

test('rechaza credenciales manipuladas o una clave incorrecta', () => {
  const encrypted = encryptCredentials({ access_token: 'token' }, 'clave-correcta', 'usuario-1');
  assert.throws(() => decryptCredentials(encrypted, 'otra-clave'));
  assert.throws(() => decryptCredentials(encrypted, 'clave-correcta', 'usuario-2'));
});

test('solo acepta direcciones HTTPS oficiales de YouTube para activar el dispositivo', () => {
  assert.equal(validateVerificationUrl('https://www.youtube.com/activate'), 'https://www.youtube.com/activate');
  assert.throws(() => validateVerificationUrl('http://www.youtube.com/activate'));
  assert.throws(() => validateVerificationUrl('https://youtube.com.example.test/activate'));
  assert.throws(() => validateVerificationUrl('javascript:alert(1)'));
});

test('extrae únicamente la autenticación necesaria de una solicitud cURL de Music', () => {
  const parsed = parseBrowserAuth(`curl 'https://music.youtube.com/youtubei/v1/browse' \\
    -H 'x-goog-authuser: 2' \\
    -H 'x-goog-pageid: canal-123' \\
    -H 'cookie: PREF=hl=es; SAPISID=secreto; SID=otro-secreto'`);

  assert.deepEqual(parsed, {
    cookie: 'PREF=hl=es; SAPISID=secreto; SID=otro-secreto',
    accountIndex: 2,
    onBehalfOfUser: 'canal-123',
  });
});

test('rechaza texto sin cookie SAPISID y entradas excesivas', () => {
  assert.throws(() => parseBrowserAuth('cookie: SID=no-es-suficiente'), /sesión válida/);
  assert.throws(() => parseBrowserAuth(`cookie: SAPISID=x\n${'a'.repeat(33_000)}`), /demasiado grande/);
});

test('acepta cookies copiadas por Chrome con -b y normaliza la variante segura', () => {
  assert.deepEqual(
    parseBrowserAuth("curl 'https://music.youtube.com/youtubei/v1/account/account_menu' -b 'SID=x; SAPISID=directa'"),
    { cookie: 'SID=x; SAPISID=directa', accountIndex: 0, onBehalfOfUser: undefined },
  );

  const secure = parseBrowserAuth(
    "curl 'https://music.youtube.com/youtubei/v1/browse' --cookie='SID=x; __Secure-3PAPISID=segura'",
  );
  assert.match(secure.cookie, /SAPISID=segura$/);
});

test('valida y normaliza una sesión capturada por la aplicación de escritorio', () => {
  assert.deepEqual(
    normalizeBrowserAuth({
      cookie: ' SID=uno ; __Secure-3PAPISID=segura ; PREF=hl=es ',
      accountIndex: 1,
      onBehalfOfUser: 'canal_123',
    }),
    {
      cookie: 'SID=uno; __Secure-3PAPISID=segura; PREF=hl=es; SAPISID=segura',
      accountIndex: 1,
      onBehalfOfUser: 'canal_123',
    },
  );
});

test('rechaza sesiones capturadas manipuladas antes de consultar YouTube', () => {
  assert.throws(() => normalizeBrowserAuth({ cookie: 'SID=uno' }), /sesión válida/);
  assert.throws(() => normalizeBrowserAuth({ cookie: 'SAPISID=uno\nCookie: SID=dos' }), /caracteres no válidos/);
  assert.throws(() => normalizeBrowserAuth({ cookie: 'SAPISID=uno', accountIndex: -1 }), /selector de cuenta/);
  assert.throws(() => normalizeBrowserAuth({ cookie: 'SAPISID=uno', onBehalfOfUser: '../canal' }), /canal seleccionado/);
});

test('comprueba la cuenta activa antes de aceptar un Inicio personalizado', async () => {
  const home = { sections: [{ title: 'Para ti' }] };
  const client = {
    account: { getInfo: async (all) => all ? [{ id: 'canal-1' }] : [] },
    music: { getHomeFeed: async () => home },
  };

  assert.equal(await verifyMusicPersonalization(client), home);
});

test('rechaza cookies presentes que YouTube no reconoce como una cuenta', async () => {
  const client = {
    account: { getInfo: async () => [] },
    music: { getHomeFeed: async () => ({ sections: [{ title: 'General' }] }) },
  };

  await assert.rejects(verifyMusicPersonalization(client), /cuenta activa/);
});

// --- Estado de la cuenta: lectura rápida, revalidación en segundo plano y sin borrados por errores transitorios ---

const originalDeps = { ...accountDeps };
let nextUser = 0;
function freshUser() {
  const id = `estado-${nextUser += 1}`;
  return { _id: { toString: () => id } };
}
const stubAuth = { cookie: 'SAPISID=x', accountIndex: 0 };

// Instala dependencias de prueba y devuelve el registro de llamadas. `verify` decide cómo responde YouTube.
function withDeps(verify, { createClient = async () => ({ session: { logged_in: true } }) } = {}) {
  const calls = { cleared: 0, clearedAll: 0, created: 0, saved: 0, verified: 0 };
  Object.assign(accountDeps, {
    clearBrowserAuth: async () => { calls.cleared += 1; },
    clearCredentials: async () => { calls.clearedAll += 1; },
    createBrowserClient: async (auth) => { calls.created += 1; return createClient(auth); },
    readBrowserAuth: async () => stubAuth,
    saveBrowserAuth: async () => { calls.saved += 1; },
    verifyMusicPersonalization: async (client) => { calls.verified += 1; return verify(client); },
    verifyTimeoutMs: 200,
  });
  return calls;
}
const restoreDeps = () => Object.assign(accountDeps, originalDeps);

test('solo una revocación inequívoca cuenta como sesión rechazada', () => {
  assert.equal(isAuthRevoked(new AccountAuthError('sin cuenta')), true);
  for (const error of [Object.assign(new Error('x'), { status: 401 }), Object.assign(new Error('x'), { info: { status_code: 403 } }), new Error('Request failed with status code 403'), new Error('fetch failed'), new Error('tiempo agotado'), Object.assign(new Error('x'), { status: 500 }), Object.assign(new Error('x'), { status: 503 }), new Error('YouTube Music no devolvió recomendaciones'), undefined]) {
    assert.equal(isAuthRevoked(error), false, String(error?.message));
  }
  assert.equal(isAuthHttpFailure(Object.assign(new Error('x'), { status: 401 })), true);
  assert.equal(isAuthHttpFailure(Object.assign(new Error('x'), { info: { status_code: 403 } })), true);
  assert.equal(isAuthHttpFailure(new Error('Request failed with status code 403')), true);
  assert.equal(isAuthHttpFailure(new Error('fetch failed')), false);
});

test('getAccountStatus responde al instante con lo guardado y no espera a YouTube', async (t) => {
  t.after(restoreDeps);
  const calls = withDeps(() => new Promise(() => {})); // YouTube nunca responde
  const user = freshUser();
  const started = Date.now();
  const status = await getAccountStatus(user);
  assert.ok(Date.now() - started < 100);
  assert.deepEqual({ connected: status.connected, status: status.status, health: status.health }, { connected: true, status: 'connected', health: 'unverified' });
  assert.equal(calls.cleared, 0);
});

test('un fallo de red o un 5xx al revalidar conserva la sesión y marca el estado degradado', async (t) => {
  t.after(restoreDeps);
  for (const failure of [new Error('fetch failed'), Object.assign(new Error('Bad gateway'), { status: 502 })]) {
    const calls = withDeps(() => { throw failure; });
    const user = freshUser();
    assert.equal(await revalidateAccount(user, { force: true }), 'degraded');
    assert.equal(calls.cleared, 0, 'no debe borrar credenciales');
    const status = await getAccountStatus(user);
    assert.deepEqual({ connected: status.connected, health: status.health }, { connected: true, health: 'degraded' });
  }
});

test('un tiempo agotado al revalidar no borra la sesión', async (t) => {
  t.after(restoreDeps);
  const calls = withDeps(() => new Promise(() => {}));
  const user = freshUser();
  assert.equal(await revalidateAccount(user, { force: true }), 'degraded');
  assert.equal(calls.cleared, 0);
});

test('YouTube rechazando la sesión la borra una vez y el estado pasa a vencida', async (t) => {
  t.after(restoreDeps);
  const calls = withDeps(() => { throw new AccountAuthError('YouTube no reconoció una cuenta activa para esta sesión.'); });
  const user = freshUser();
  assert.equal(await revalidateAccount(user, { force: true }), 'expired');
  assert.equal(calls.cleared, 1);
  const status = await getAccountStatus(user);
  assert.deepEqual({ connected: status.connected, status: status.status, expired: status.expired }, { connected: false, status: 'error', expired: true });
});

test('tres 401 o 403 consecutivos y espaciados vencen la sesión; llamadas inmediatas no adelantan el umbral', async (t) => {
  t.after(restoreDeps);
  let now = 10_000;
  const calls = withDeps(() => { throw Object.assign(new Error('Request failed with status code 403'), { status: 403 }); });
  accountDeps.now = () => now;
  const user = freshUser();

  assert.equal(await revalidateAccount(user, { force: true }), 'degraded');
  assert.equal(await revalidateAccount(user, { force: true }), 'degraded', 'un reintento inmediato no suma otro fallo');
  assert.equal(calls.cleared, 0);

  now += AUTH_HTTP_FAILURE_MIN_INTERVAL_MS;
  assert.equal(await revalidateAccount(user, { force: true }), 'degraded');
  assert.equal(calls.cleared, 0);

  now += AUTH_HTTP_FAILURE_MIN_INTERVAL_MS;
  assert.equal(await revalidateAccount(user, { force: true }), 'expired');
  assert.equal(calls.cleared, 1);
  assert.equal((await getAccountStatus(user)).expired, true);
});

test('una revalidación correcta marca el estado como verificado y se deduplica', async (t) => {
  t.after(restoreDeps);
  const calls = withDeps(async () => ({}));
  const user = freshUser();
  await Promise.all([revalidateAccount(user, { force: true }), revalidateAccount(user, { force: true }), revalidateAccount(user)]);
  assert.equal(calls.created, 1, 'las simultáneas comparten una sola comprobación');
  assert.equal((await getAccountStatus(user)).health, 'ok');
  // Dentro del intervalo no vuelve a consultar a YouTube.
  assert.equal(await revalidateAccount(user), 'ok');
  assert.equal(calls.created, 1);
});

test('getYoutubeForUser conserva la sesión ante fallos HTTP y la borra solo si la verificación la revocó', async (t) => {
  t.after(restoreDeps);
  let calls = withDeps(async () => ({}), { createClient: async () => { throw new Error('getaddrinfo ENOTFOUND www.youtube.com'); } });
  assert.equal(await getYoutubeForUser(freshUser()), null);
  assert.equal(calls.cleared, 0, 'sin red no se borra nada');

  calls = withDeps(async () => ({}), { createClient: async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); } });
  assert.equal(await getYoutubeForUser(freshUser()), null);
  assert.equal(calls.cleared, 0, 'un 401 aislado no prueba que la cookie fue revocada');

  calls = withDeps(async () => ({}), { createClient: async () => { throw new AccountAuthError('sin cuenta activa'); } });
  const revoked = freshUser();
  assert.equal(await getYoutubeForUser(revoked), null);
  assert.equal(calls.cleared, 1);
  assert.equal((await getAccountStatus(revoked)).expired, true);
});

test('desvincular mientras se revalida impide que el resultado tardío restaure la cuenta', async (t) => {
  t.after(restoreDeps);
  const user = freshUser();
  let auth = stubAuth;
  let releaseVerification;
  let verificationStarted;
  const started = new Promise((resolve) => { verificationStarted = resolve; });
  const blocked = new Promise((resolve) => { releaseVerification = resolve; });
  Object.assign(accountDeps, {
    clearBrowserAuth: async () => { auth = null; },
    clearCredentials: async () => { auth = null; },
    createBrowserClient: async () => ({ session: { logged_in: true } }),
    readBrowserAuth: async () => auth,
    saveBrowserAuth: async () => {},
    verifyMusicPersonalization: async () => { verificationStarted(); await blocked; },
    verifyTimeoutMs: 500,
  });

  const validation = revalidateAccount(user, { force: true });
  await started;
  await unlinkAccount(user);
  releaseVerification();

  assert.equal(await validation, 'stale');
  assert.equal(auth, null);
  assert.equal(await getYoutubeForUser(user), null);
});

test('desvincular durante una nueva validación evita guardar una sesión tardía', async (t) => {
  t.after(restoreDeps);
  const user = freshUser();
  let saved = 0;
  let releaseVerification;
  let verificationStarted;
  const started = new Promise((resolve) => { verificationStarted = resolve; });
  const blocked = new Promise((resolve) => { releaseVerification = resolve; });
  Object.assign(accountDeps, {
    clearBrowserAuth: async () => {},
    clearCredentials: async () => {},
    createBrowserClient: async () => ({ session: { logged_in: true } }),
    readBrowserAuth: async () => null,
    saveBrowserAuth: async () => { saved += 1; },
    verifyMusicPersonalization: async () => { verificationStarted(); await blocked; },
    verifyTimeoutMs: 500,
  });

  const connection = connectCapturedBrowserSession(user, stubAuth);
  await started;
  await unlinkAccount(user);
  releaseVerification();

  await assert.rejects(connection, /vinculación cambió/);
  assert.equal(saved, 0);
});
