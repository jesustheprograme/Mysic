import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptCredentials, encryptCredentials, parseBrowserAuth, validateVerificationUrl } from './accountLink.mjs';

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
