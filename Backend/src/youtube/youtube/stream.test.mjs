import assert from 'node:assert/strict';
import test from 'node:test';
import { invalidateStream, loadAudioStream, resolveAudioStream } from './stream.mjs';

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

test('usa YTMUSIC con un PO token ligado al video', async () => {
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
