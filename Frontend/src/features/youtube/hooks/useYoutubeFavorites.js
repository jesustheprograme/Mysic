import { useMemo, useState } from 'react'
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
  const ids = useMemo(() => new Set(entries.keys()), [entries])
  const items = useMemo(() => [...entries.values()].filter(Boolean), [entries])

  function toggleFavorite(id, liked, item = null) {
    if (!id) return
    setEntries((current) => {
      const next = new Map(current)
      if (liked) next.set(id, item ?? current.get(id) ?? null)
      else next.delete(id)
      writeStorage(storageKey, serializeFavoriteEntries(next))
      return next
    })
  }

  return { ids, items, toggleFavorite }
}
