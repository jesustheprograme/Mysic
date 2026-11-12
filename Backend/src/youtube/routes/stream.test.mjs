// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioStreamError } from '../youtube/stream.mjs';
import { applyAudioCors, applyAudioResponseHeaders, streamErrorResponse, streamHeadResponse } from './stream.mjs';

function responseDouble() {
  const headers = new Map();
  return {
    headers,
    statusCode: null,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    append(name, value) { headers.set(name.toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
  };
}

test('expone Range y permite credenciales desde el origen solicitante', () => {
  const res = responseDouble();
  applyAudioCors({ get: () => 'https://app.example.test' }, res);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.test');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.match(res.headers.get('access-control-expose-headers'), /Content-Range/);
});

test('propaga 206 y Content-Range para que el seek funcione', () => {
  const res = responseDouble();
  const upstream = {
    status: 206,
    headers: new Headers({
      'content-type': 'audio/mp4',
      'content-length': '1000',
      'content-range': 'bytes 1000-1999/9000',
    }),
  };
  applyAudioResponseHeaders({ headers: { range: 'bytes=1000-' } }, res, upstream, { mimeType: 'audio/webm' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-range'), 'bytes 1000-1999/9000');
  assert.equal(res.headers.get('content-length'), '1000');
});

test('convierte errores tipados en una respuesta estable', () => {
  const response = streamErrorResponse(new AudioStreamError('Privado', {
    status: 404,
    code: 'VIDEO_UNAVAILABLE',
  }));
  assert.deepEqual(response, {
    status: 404,
    body: {
      code: 'VIDEO_UNAVAILABLE',
      message: 'Privado',
    },
  });
});

test('los cinco errores públicos comparten exactamente code y message', () => {
  const cases = [
    [401, 'YOUTUBE_SESSION_REQUIRED'],
    [403, 'AGE_RESTRICTED'],
    [404, 'VIDEO_UNAVAILABLE'],
    [422, 'LIVE_HLS_UNSUPPORTED'],
    [504, 'YOUTUBE_TIMEOUT'],
  ];
  for (const [status, code] of cases) {
    const response = streamErrorResponse(new AudioStreamError('Mensaje estable', { status, code }));
    assert.equal(response.status, status);
    assert.deepEqual(response.body, { code, message: 'Mensaje estable' });
  }
});

test('el tramo inicial solo responde a la petición abierta desde el byte 0', () => {
  const head = { body: Buffer.alloc(1000, 1), total: 5000, contentType: 'audio/webm' };
  const response = streamHeadResponse('bytes=0-', head);
  assert.equal(response.status, 206);
  assert.equal(response.headers['Content-Range'], 'bytes 0-999/5000');
  assert.equal(response.headers['Content-Length'], '1000');
  assert.equal(response.headers['Content-Type'], 'audio/webm');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body, head.body);
  // Un salto, un rango cerrado, varios rangos o una petición sin Range siguen por el proxy normal.
  for (const range of ['bytes=1000-', 'bytes=0-499', 'bytes=0-,5-9', 'bytes=-500', '', undefined]) {
    assert.equal(streamHeadResponse(range, head), null, String(range));
  }
  assert.equal(streamHeadResponse('bytes=0-', null), null);
});