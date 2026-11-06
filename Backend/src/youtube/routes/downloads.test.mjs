import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createDownloadsRouter } from './downloads.mjs';

async function seedDownload(root, userId, songId, title) {
  const userDir = path.join(root, userId);
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(path.join(userDir, `${songId}.m4a`), 'audio');
  await fs.writeFile(path.join(userDir, 'index.json'), JSON.stringify({
    items: [{ id: songId, title, artist: 'Prueba', hasCover: false }],
  }));
}

test('mantiene las descargas aisladas por cuenta', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-downloads-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seedDownload(root, 'user-one', 'aaaaaaaaaaa', 'Canción uno');
  await seedDownload(root, 'user-two', 'bbbbbbbbbbb', 'Canción dos');

  const app = express();
  app.use((req, _res, next) => {
    req.mysicUser = { _id: { toString: () => req.get('x-test-user') } };
    next();
  });
  app.use(createDownloadsRouter({
    dir: root,
    resolveAudioStream: async () => { throw new Error('No debe descargar en esta prueba'); },
    invalidateStream() {},
  }));
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const one = await fetch(baseUrl, { headers: { 'x-test-user': 'user-one' } }).then((response) => response.json());
  const two = await fetch(baseUrl, { headers: { 'x-test-user': 'user-two' } }).then((response) => response.json());

  assert.deepEqual(one.items.map((item) => item.id), ['aaaaaaaaaaa']);
  assert.deepEqual(two.items.map((item) => item.id), ['bbbbbbbbbbb']);

  const deleted = await fetch(`${baseUrl}/aaaaaaaaaaa`, {
    method: 'DELETE',
    headers: { 'x-test-user': 'user-one' },
  });
  assert.equal(deleted.status, 200);
  assert.equal(await fs.readFile(path.join(root, 'user-two', 'bbbbbbbbbbb.m4a'), 'utf8'), 'audio');
});
