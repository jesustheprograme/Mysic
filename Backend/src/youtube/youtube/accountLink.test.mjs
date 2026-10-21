import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptCredentials, encryptCredentials } from './accountLink.mjs';

test('cifra y descifra credenciales de YouTube Music sin exponer el contenido', () => {
  const credentials = { access_token: 'token-secreto', refresh_token: 'refresh-secreto', expiry_date: '2030-01-01' };
  const encrypted = encryptCredentials(credentials, 'clave-de-prueba-muy-larga');

  assert.equal(JSON.stringify(encrypted).includes('token-secreto'), false);
  assert.deepEqual(decryptCredentials(encrypted, 'clave-de-prueba-muy-larga'), credentials);
});

test('rechaza credenciales manipuladas o una clave incorrecta', () => {
  const encrypted = encryptCredentials({ access_token: 'token' }, 'clave-correcta');
  assert.throws(() => decryptCredentials(encrypted, 'otra-clave'));
});
