// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPersistentSearchCache } from './persistentSearchCache.mjs';

async function withCacheDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-search-cache-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('persiste resultados entre instancias', async () => withCacheDir(async (dir) => {
  const first = createPersistentSearchCache({ dir, freshTtlMs: 1_000, staleTtlMs: 2_000, maxSize: 10 });
  assert.deepEqual(await first.get('song:ado', async () => ({ items: ['Ado'] })), { items: ['Ado'] });

  const second = createPersistentSearchCache({ dir, freshTtlMs: 1_000, staleTtlMs: 2_000, maxSize: 10 });
  assert.deepEqual(await second.get('song:ado', async () => assert.fail('no debe consultar la red')), { items: ['Ado'] });
}));

test('deduplica cargas simultáneas', async () => withCacheDir(async (dir) => {
  const cache = createPersistentSearchCache({ dir, freshTtlMs: 1_000, staleTtlMs: 2_000, maxSize: 10 });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { ok: true };
  };

  const [first, second] = await Promise.all([cache.get('all:ado', load), cache.get('all:ado', load)]);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(loads, 1);
}));

test('sirve el valor anterior mientras lo actualiza', async () => withCacheDir(async (dir) => {
  let time = 0;
  const cache = createPersistentSearchCache({
    dir,
    freshTtlMs: 10,
    staleTtlMs: 1_000,
    maxSize: 10,
    now: () => time,
  });
  await cache.get('artist:ado', async () => ({ version: 1 }));
  time = 20;

  assert.deepEqual(await cache.get('artist:ado', async () => ({ version: 2 })), { version: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await cache.get('artist:ado', async () => assert.fail('debe estar actualizada')), { version: 2 });
}));
