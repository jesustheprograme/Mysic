import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsyncTtlCache } from './asyncCache.mjs';

test('reutiliza el valor y deduplica cargas concurrentes', async () => {
  const cache = createAsyncTtlCache({ ttlMs: 1000, maxSize: 10 });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return 'resultado';
  };

  const [first, second] = await Promise.all([cache.get('a', load), cache.get('a', load)]);
  assert.equal(first, 'resultado');
  assert.equal(second, 'resultado');
  assert.equal(await cache.get('a', load), 'resultado');
  assert.equal(loads, 1);
});

test('expira por TTL y respeta el límite LRU', async () => {
  let time = 0;
  const cache = createAsyncTtlCache({ ttlMs: 10, maxSize: 2, now: () => time });
  let loads = 0;
  const load = async (value) => {
    loads += 1;
    return value;
  };

  await cache.get('a', () => load('a1'));
  await cache.get('b', () => load('b1'));
  await cache.get('a', () => load('a2'));
  await cache.get('c', () => load('c1'));
  assert.equal(await cache.get('b', () => load('b2')), 'b2');
  time = 11;
  assert.equal(await cache.get('a', () => load('a3')), 'a3');
  assert.equal(loads, 5);
});

test('invalidar durante una carga evita guardar el resultado obsoleto', async () => {
  const cache = createAsyncTtlCache({ ttlMs: 1000, maxSize: 10 });
  let resolveLoad;
  const first = cache.get('a', () => new Promise((resolve) => { resolveLoad = resolve; }));
  await Promise.resolve();
  cache.delete('a');
  resolveLoad('viejo');
  assert.equal(await first, 'viejo');
  assert.equal(await cache.get('a', async () => 'nuevo'), 'nuevo');
});
