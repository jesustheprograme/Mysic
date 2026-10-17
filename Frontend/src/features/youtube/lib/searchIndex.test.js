// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIndexedSearchResult, normalizeSearchText, readIndexedSearch, writeIndexedSearch } from './searchIndex.js';

test('exact cache does not present partial matches from another query', async () => {
  const data = { type: 'song', items: [{ id: 'amargue', title: 'Luisa María', artist: 'Luis Miguel del Amargue' }] };
  await writeIndexedSearch('bachata', 'song', data);
  assert.equal(await readIndexedSearch('Luis Miguel', 'song', { exactOnly: true }), null);
  await writeIndexedSearch('Luis Miguel', 'song', { type: 'song', items: [{ id: 'correct' }] });
  assert.equal((await readIndexedSearch('luis miguel', 'song', { exactOnly: true })).items[0].id, 'correct');
  assert.equal(await readIndexedSearch('Luis Miguel', 'album', { exactOnly: true }), null);
});

const now = 2_000_000;

function record(query, type, data, updatedAt = now) {
  return { key: `${type}:${normalizeSearchText(query)}`, query, type, data, updatedAt };
}

test('returns the exact cached response without rebuilding it', () => {
  const data = { type: 'song', items: [{ id: '1', title: 'Usseewa' }] };
  const result = buildIndexedSearchResult([record('Ado', 'song', data)], 'ado', 'song', { now });
  assert.equal(result, data);
});

test('finds known results with case and accent insensitive tokens', () => {
  const data = {
    type: 'all',
    songs: [{ id: 'song-1', title: 'Canción Épica', artist: 'Álvaro Díaz' }],
    artists: [],
    albums: [],
  };
  const result = buildIndexedSearchResult([record('Álvaro', 'all', data)], 'cancion alvaro', 'all', { now });
  assert.deepEqual(result?.songs.map((item) => item.id), ['song-1']);
});

test('deduplicates items collected from multiple cached searches', () => {
  const item = { id: 'album-1', title: 'Retrospectives', artist: 'Slowdown' };
  const records = [
    record('Slowdown', 'album', { type: 'album', items: [item] }),
    record('Retrospectives', 'all', { type: 'all', songs: [], artists: [], albums: [item] }, now - 1),
  ];
  const result = buildIndexedSearchResult(records, 'retrospectives', 'album', { now });
  assert.equal(result?.items.length, 1);
});

test('ignores records older than the configured lifetime', () => {
  const data = { type: 'song', items: [{ id: 'old', title: 'Old song' }] };
  const result = buildIndexedSearchResult(
    [record('Old song', 'song', data, now - 101)],
    'old song',
    'song',
    { now, ttlMs: 100 },
  );
  assert.equal(result, null);
});
