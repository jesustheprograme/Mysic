// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function cacheFile(dir, key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return path.join(dir, `${hash}.json`);
}

export function createPersistentSearchCache({ dir, freshTtlMs, staleTtlMs, maxSize, now = Date.now }) {
  const memory = new Map();
  const inflight = new Map();

  function remember(key, entry) {
    memory.delete(key);
    memory.set(key, entry);
    if (memory.size > maxSize) memory.delete(memory.keys().next().value);
  }

  async function read(key) {
    const inMemory = memory.get(key);
    if (inMemory) {
      remember(key, inMemory);
      return inMemory;
    }

    try {
      const entry = JSON.parse(await fs.readFile(cacheFile(dir, key), 'utf8'));
      if (entry.key !== key || !entry.fetchedAt || entry.value == null) return null;
      remember(key, entry);
      return entry;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`[search-cache] lectura fallida: ${error.message}`);
      return null;
    }
  }

  async function write(key, value) {
    const entry = { key, value, fetchedAt: now() };
    remember(key, entry);
    await fs.mkdir(dir, { recursive: true });
    const file = cacheFile(dir, key);
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(entry));
    await fs.rename(temporary, file);
    return value;
  }

  function refresh(key, load) {
    const active = inflight.get(key);
    if (active) return active;

    const request = Promise.resolve()
      .then(load)
      .then((value) => write(key, value))
      .finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
  }

  return {
    async get(key, load) {
      const entry = await read(key);
      const age = entry ? now() - entry.fetchedAt : Number.POSITIVE_INFINITY;

      if (age <= freshTtlMs) return entry.value;
      if (age <= staleTtlMs) {
        refresh(key, load).catch((error) =>
          console.warn(`[search-cache] actualización fallida: ${error.message}`)
        );
        return entry.value;
      }
      return refresh(key, load);
    },
  };
}
