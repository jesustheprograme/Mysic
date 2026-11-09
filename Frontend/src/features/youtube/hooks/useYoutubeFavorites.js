import { useEffect, useMemo, useRef, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage.js'

export function parseFavoriteEntries(stored) {
  return new Map((Array.isArray(stored) ? stored : []).flatMap((entry) => {
    if (typeof entry === 'string' && entry) return [[entry, null]]
    if (entry?.id) return [[entry.id, entry]]
    return []
  }))
}

export function serializeFavoriteEntries(entries) {
  return [...entries].map(([entryId, entry]) => entry ?? entryId)
}

/**
 * Suma muchos favoritos de una vez. Devuelve el mismo Map si no hay nada nuevo (React no repinta) y,
 * si lo hay, uno solo nuevo: sincronizar miles de Me gusta uno a uno copiaba el Map y reescribía todo el
 * almacenamiento por cada canción (con 4000 canciones, casi 20 s de hilo bloqueado y cientos de MB de basura).
 */
export function mergeFavoriteEntries(current, items) {
  let next = null
  for (const item of items) {
    if (!item?.id || current.has(item.id) || next?.has(item.id)) continue
    next ??= new Map(current)
    next.set(item.id, item)
  }
  return next ?? current
}

function readFavoriteEntries(storageKey, legacyStorageKey) {
  const stored = readStorage(storageKey, [])
  if (stored.length || !legacyStorageKey || legacyStorageKey === storageKey) {
    return parseFavoriteEntries(stored)
  }

  const legacyEntries = parseFavoriteEntries(readStorage(legacyStorageKey, []))
  if (legacyEntries.size) {
    writeStorage(storageKey, serializeFavoriteEntries(legacyEntries))
    window.localStorage.removeItem(legacyStorageKey)
  }
  return legacyEntries
}

export function useYoutubeFavorites(storageKey, legacyStorageKey = null) {
  const [entries, setEntries] = useState(() => readFavoriteEntries(storageKey, legacyStorageKey))
  const persistedRef = useRef(entries)
  const ids = useMemo(() => new Set(entries.keys()), [entries])
  const items = useMemo(() => [...entries.values()].filter(Boolean), [entries])

  // La escritura vive en un efecto (una por commit), no dentro del actualizador del estado.
  useEffect(() => {
    if (persistedRef.current === entries) return
    persistedRef.current = entries
    writeStorage(storageKey, serializeFavoriteEntries(entries))
  }, [entries, storageKey])

  function toggleFavorite(id, liked, item = null) {
    if (!id) return
    setEntries((current) => {
      if (liked ? current.has(id) && !item : !current.has(id)) return current
      const next = new Map(current)
      if (liked) next.set(id, item ?? current.get(id) ?? null)
      else next.delete(id)
      return next
    })
  }

  function addFavorites(songs) {
    setEntries((current) => mergeFavoriteEntries(current, songs))
  }

  return { addFavorites, ids, items, toggleFavorite }
}