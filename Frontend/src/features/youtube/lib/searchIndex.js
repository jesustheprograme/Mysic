// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
const DATABASE_NAME = 'mysic-search-index';
const DATABASE_VERSION = 1;
const STORE_NAME = 'results';
const MAX_RECORDS = 80;
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memoryIndex = new Map();
let databasePromise;

function pruneMemoryIndex(now = Date.now()) {
  const retained = [...memoryIndex.values()]
    .filter((record) => now - record.updatedAt <= RECORD_TTL_MS)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RECORDS);
  memoryIndex.clear();
  retained.forEach((record) => memoryIndex.set(record.key, record));
}

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ');
}

function createRecordKey(query, type) {
  return `${type}:${normalizeSearchText(query)}`;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
  }

  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredRecords() {
  const database = await openDatabase();
  if (!database) return [...memoryIndex.values()];

  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    records.forEach((record) => memoryIndex.set(record.key, record));
    pruneMemoryIndex();
    return [...memoryIndex.values()];
  } catch {
    return [...memoryIndex.values()];
  }
}

function sectionItems(record, kind) {
  const data = record?.data;
  if (!data) return [];
  if (data.type === 'all') {
    if (kind === 'song') return data.songs ?? [];
    if (kind === 'artist') return data.artists ?? [];
    if (kind === 'album') return data.albums ?? [];
  }
  return data.type === kind ? data.items ?? [] : [];
}

function searchableItemText(item) {
  return normalizeSearchText([
    item?.title,
    item?.name,
    item?.artist,
    item?.album,
    item?.subtitle,
    item?.kind,
    item?.year,
  ].filter(Boolean).join(' '));
}

function collectMatches(records, kind, tokens, limit) {
  const matches = [];
  const seen = new Set();

  for (const record of records) {
    for (const item of sectionItems(record, kind)) {
      const text = searchableItemText(item);
      if (!tokens.every((token) => text.includes(token))) continue;

      const identity = item?.id ?? `${kind}:${text}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      matches.push(item);
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}

export function buildIndexedSearchResult(
  records,
  query,
  type = 'all',
  { now = Date.now(), ttlMs = RECORD_TTL_MS } = {},
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  const validRecords = records
    .filter((record) => record?.data && now - record.updatedAt <= ttlMs)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const exact = validRecords.find((record) => record.key === `${type}:${normalizedQuery}`);
  if (exact) return exact.data;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (!tokens.length) return null;

  if (type !== 'all') {
    const items = collectMatches(validRecords, type, tokens, 30);
    return items.length ? { type, items } : null;
  }

  const songs = collectMatches(validRecords, 'song', tokens, 30);
  const artists = collectMatches(validRecords, 'artist', tokens, 20);
  const albums = collectMatches(validRecords, 'album', tokens, 20);
  if (!songs.length && !artists.length && !albums.length) return null;
  return { type: 'all', top: null, songs, artists, albums };
}

export async function readIndexedSearch(query, type = 'all') {
  const records = await readStoredRecords();
  return buildIndexedSearchResult(records, query, type);
}

async function persistRecord(record) {
  const database = await openDatabase();
  if (!database) return;

  const existing = await readStoredRecords();
  const currentTime = Date.now();
  const expiredKeys = existing
    .filter((item) => currentTime - item.updatedAt > RECORD_TTL_MS)
    .map((item) => item.key);
  const expired = new Set(expiredKeys);
  const retained = existing
    .filter((item) => !expired.has(item.key) && item.key !== record.key)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const recordsToDelete = new Set([
    ...expiredKeys,
    ...retained.slice(MAX_RECORDS - 1).map((item) => item.key),
  ]);

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(record);
    recordsToDelete.forEach((key) => store.delete(key));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function writeIndexedSearch(query, type = 'all', data) {
  if (!data || !normalizeSearchText(query)) return;

  const record = {
    key: createRecordKey(query, type),
    query: String(query).trim(),
    type,
    data,
    updatedAt: Date.now(),
  };
  memoryIndex.set(record.key, record);
  pruneMemoryIndex(record.updatedAt);

  try {
    await persistRecord(record);
  } catch {
    // La memoria conserva el índice durante la sesión si IndexedDB no está disponible.
  }
}
