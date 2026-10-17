/** Caché TTL con límite LRU y deduplicación de solicitudes concurrentes. */
export function createAsyncTtlCache({ ttlMs, maxSize, now = Date.now }) {
  const values = new Map();
  const pending = new Map();
  const versions = new Map();

  const remember = (key, value) => {
    values.delete(key);
    values.set(key, { value, expiresAt: now() + ttlMs });
    while (values.size > maxSize) values.delete(values.keys().next().value);
  };

  return {
    get(key, load) {
      const cached = values.get(key);
      if (cached?.expiresAt > now()) {
        values.delete(key);
        values.set(key, cached);
        return Promise.resolve(cached.value);
      }
      if (cached) values.delete(key);
      if (pending.has(key)) return pending.get(key);

      const version = versions.get(key) || 0;
      const request = Promise.resolve()
        .then(load)
        .then((value) => {
          if ((versions.get(key) || 0) === version) remember(key, value);
          return value;
        })
        .finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        });
      pending.set(key, request);
      return request;
    },

    delete(key) {
      values.delete(key);
      versions.set(key, (versions.get(key) || 0) + 1);
    },
  };
}
