// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AudioStreamError,
  invalidateStream,
  loadAudioStream,
  peekStreamHead,
  prefetchStreamHead,
  resolveAudioStream,
  STREAM_HEAD_MAX,
} from './stream.mjs';

function playableYoutube(onInfo) {
  return {
    session: { player: {} },
    async getBasicInfo(videoId, options) {
      onInfo?.(videoId, options);
      return {
        playability_status: { status: 'OK' },
        chooseFormat() {
          return {
            mime_type: 'audio/mp4',
            content_length: 2048,
            decipher: async () => 'https://audio.example.test/file?source=test',
          };
        },
      };
    },
  };
}

test('usa YTMUSIC con un PO token ligado al vídeo', async () => {
  const calls = [];
  const result = await loadAudioStream(
    'abcdefghijk',
    playableYoutube((videoId, options) => calls.push({ videoId, options })),
    async (videoId) => `token-${videoId}`,
  );
  assert.deepEqual(calls, [{
    videoId: 'abcdefghijk',
    options: { client: 'YTMUSIC', po_token: 'token-abcdefghijk' },
  }]);
  assert.equal(result.client, 'YTMUSIC');
  assert.equal(result.contentLength, 2048);
  assert.match(result.url, /pot=token-abcdefghijk/);
});

test('aísla la caché de streams entre usuarios', async () => {
  const videoId = 'scopevideo1';
  let resolutions = 0;
  const youtube = playableYoutube(() => { resolutions += 1; });
  const options = { youtube, mintToken: async () => 'token', cacheScope: 'user:one' };
  await resolveAudioStream(videoId, options);
  await resolveAudioStream(videoId, options);
  await resolveAudioStream(videoId, { ...options, cacheScope: 'user:two' });
  assert.equal(resolutions, 2);
  invalidateStream(videoId, 'user:one');
  await resolveAudioStream(videoId, options);
  assert.equal(resolutions, 3);
});

const failures = [
  ['LOGIN_REQUIRED', 'Sign in to confirm you are not a bot', 401, 'YOUTUBE_SESSION_REQUIRED'],
  ['AGE_CHECK_REQUIRED', 'This video may be inappropriate for some users', 403, 'AGE_RESTRICTED'],
  ['UNPLAYABLE', 'This is a private video', 404, 'VIDEO_UNAVAILABLE'],
  ['LOGIN_REQUIRED', 'This is a private video', 404, 'VIDEO_UNAVAILABLE'],
  ['ERROR', 'Video deleted', 404, 'VIDEO_UNAVAILABLE'],
];

for (const [status, reason, expectedStatus, code] of failures) {
  test(`clasifica ${status} sin probar indefinidamente otros clientes`, async () => {
    let calls = 0;
    const youtube = {
      async getBasicInfo() {
        calls += 1;
        return { playability_status: { status, reason } };
      },
    };
    await assert.rejects(
      loadAudioStream('abcdefghijk', youtube, async () => 'token'),
      (error) => error instanceof AudioStreamError && error.status === expectedStatus && error.code === code,
    );
    assert.equal(calls, 1);
  });
}

test('informa 422 cuando un directo solo ofrece HLS', async () => {
  const youtube = {
    async getBasicInfo() {
      return {
        playability_status: { status: 'OK' },
        streaming_data: { hlsManifestUrl: 'https://live.example.test/master.m3u8' },
        chooseFormat() { throw new Error('No matching format found'); },
      };
    },
  };
  await assert.rejects(
    loadAudioStream('abcdefghijk', youtube, async () => 'token'),
    (error) => error.status === 422 && error.code === 'LIVE_HLS_UNSUPPORTED',
  );
});

test('corta una resolución bloqueada con 504', async () => {
  const youtube = { getBasicInfo: () => new Promise(() => {}) };
  await assert.rejects(
    loadAudioStream('abcdefghijk', youtube, async () => 'token', { timeoutMs: 10 }),
    (error) => error.status === 504 && error.code === 'YOUTUBE_TIMEOUT',
  );
});

// --- Tramo inicial precargado ---
const headStream = (url = 'https://audio.example.test/head') => ({ url, mimeType: 'audio/mp4' });
function headFetch({ status = 206, total = 5000, calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url, range: init.headers.Range });
    const end = Number(/-(\d+)$/.exec(init.headers.Range)[1]);
    const length = Math.min(end + 1, total);
    return new Response(status === 206 ? new Uint8Array(length).fill(7) : 'no', {
      status,
      headers: status === 206 ? { 'content-range': `bytes 0-${length - 1}/${total}`, 'content-type': 'audio/webm' } : {},
    });
  };
}

test('prefetchStreamHead descarga el primer tramo, lo guarda y las llamadas simultáneas comparten la descarga', async () => {
  const calls = [];
  const options = { cacheScope: 'user:head-1', fetchImpl: headFetch({ calls }), headBytes: 1000 };
  const [first, second] = await Promise.all([
    prefetchStreamHead('headvideo01', headStream(), options),
    prefetchStreamHead('headvideo01', headStream(), options),
  ]);
  assert.equal(first, second);
  assert.deepEqual(calls, [{ url: 'https://audio.example.test/head', range: 'bytes=0-999' }]);
  assert.equal(first.body.length, 1000);
  assert.equal(first.total, 5000);
  assert.equal(first.contentType, 'audio/webm');
  await prefetchStreamHead('headvideo01', headStream(), options);
  assert.equal(calls.length, 1, 'un tramo vigente no se vuelve a descargar');
  assert.equal(peekStreamHead('headvideo01', 'user:head-1'), first);
});

test('el tramo inicial es por usuario, solo vale para la misma URL y caduca', async () => {
  let current = 1_000;
  const options = { cacheScope: 'user:head-2', fetchImpl: headFetch(), headBytes: 500, now: () => current, ttlMs: 1_000 };
  await prefetchStreamHead('headvideo02', headStream(), options);
  assert.equal(peekStreamHead('headvideo02', 'user:otro', { now: () => current }), null);
  assert.equal(peekStreamHead('headvideo02', 'anonymous', { now: () => current }), null);
  assert.equal(peekStreamHead('headvideo02', 'user:head-2', { now: () => current, url: 'https://audio.example.test/otra' }), null);
  assert.ok(peekStreamHead('headvideo02', 'user:head-2', { now: () => current, url: 'https://audio.example.test/head' }));
  current += 1_000;
  assert.equal(peekStreamHead('headvideo02', 'user:head-2', { now: () => current }), null);
});

test('un origen que no entrega 206 o un tramo incoherente no se guarda, y se puede reintentar', async () => {
  const scope = { cacheScope: 'user:head-3', headBytes: 500 };
  await assert.rejects(
    prefetchStreamHead('headvideo03', headStream(), { ...scope, fetchImpl: headFetch({ status: 403 }) }),
    { code: 'AUDIO_HEAD_UNAVAILABLE' },
  );
  assert.equal(peekStreamHead('headvideo03', 'user:head-3'), null);
  const noRange = async () => new Response(new Uint8Array(10), { status: 206 });
  await assert.rejects(prefetchStreamHead('headvideo03', headStream(), { ...scope, fetchImpl: noRange }), { code: 'AUDIO_HEAD_UNAVAILABLE' });
  const entry = await prefetchStreamHead('headvideo03', headStream(), { ...scope, fetchImpl: headFetch() });
  assert.equal(entry.body.length, 500);
});

test('invalidateStream descarta también el tramo inicial y la caché de tramos está acotada', async () => {
  const options = { cacheScope: 'user:head-4', fetchImpl: headFetch(), headBytes: 100 };
  await prefetchStreamHead('headvideo04', headStream(), options);
  invalidateStream('headvideo04', 'user:head-4');
  assert.equal(peekStreamHead('headvideo04', 'user:head-4'), null);
  for (let index = 0; index <= STREAM_HEAD_MAX; index += 1) {
    await prefetchStreamHead(`headfill${String(index).padStart(3, '0')}`, headStream(), options);
  }
  assert.equal(peekStreamHead('headfill000', 'user:head-4'), null, 'el más antiguo se expulsa');
  assert.ok(peekStreamHead(`headfill${String(STREAM_HEAD_MAX).padStart(3, '0')}`, 'user:head-4'));
});