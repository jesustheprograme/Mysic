import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfficialYoutubeLibrary } from './dataApi.mjs';

test('rejects malformed YouTube Data API tokens before making a request', async () => {
  await assert.rejects(() => getOfficialYoutubeLibrary('short'), /Token de YouTube no válido/);
});
