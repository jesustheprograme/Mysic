import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptCredentials, encryptCredentials, validateVerificationUrl } from './accountLink.mjs';

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
