// Base de datos local de Mysic (IndexedDB): datos grandes que no caben en el almacenamiento local (~5 MB, que ya se
// llenó una vez). Todo fallo se trata como "no hay dato": la app funciona igual sin ella.
const DB_NAME = 'mysic'
const VERSION = 2
export const STORES = { liked: 'liked-songs', playlists: 'playlist-index' }

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      for (const name of Object.values(STORES)) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return dbPromise
}

function run(store, mode, action) {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null)
    try {
      const transaction = db.transaction(store, mode)
      const request = action(transaction.objectStore(store))
      transaction.oncomplete = () => resolve(request?.result ?? true)
      transaction.onerror = () => resolve(null)
      transaction.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  }))
}

export const dbGet = (store, key) => run(store, 'readonly', (objects) => objects.get(key))
export const dbPut = (store, key, value) => run(store, 'readwrite', (objects) => objects.put(value, key))
export const dbDelete = (store, key) => run(store, 'readwrite', (objects) => objects.delete(key))
