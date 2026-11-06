import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isDesktopShell } from '../../lib/desktopShell.js'
import { API_BASE } from '../youtube/lib/api.js'
import { copySongToLocal } from './copyToLocal.js'
import { createDownloadQueue } from './downloadQueue.js'
import { localAudioApi, localAudioUrl } from './localAudioApi.js'
import { installLocalMediaSource } from './localSource.js'

// Máximo de copias a la vez: suficiente para ir rápido sin saturar la red ni el servidor.
const MAX_CONCURRENT_COPIES = 2
// Al arrancar se deja respirar a la interfaz antes de empezar a copiar el atrasado.
const STARTUP_DELAY_MS = 4000

const errorText = (error) => String(error?.message ?? error)

/**
 * Añade copias locales a las descargas (solo escritorio).
 *
 * Envuelve el resultado de `useDownloads()` (código generado) sin modificarlo:
 *  - Copia al disco del usuario cada canción descargada en el servidor, con cola de 2 como máximo,
 *    solo con conexión y dejando de intentarlo si se llena el espacio reservado.
 *  - Redirige la reproducción de audio descargado al archivo local (ver localSource.js).
 *  - Mantiene visibles y reproducibles las descargas locales aunque el servidor no responda.
 *  - Borrar una descarga también borra su copia local.
 * En la web devuelve el resultado original sin cambios.
 */
export default function useLocalDownloads(base) {
  const desktop = isDesktopShell()
  const storeRef = useRef(new Map())
  const queueRef = useRef(null)
  const outOfSpaceRef = useRef(false)
  // storeRef es la fuente de verdad síncrona (la lee el adaptador de audio); localItems es su copia
  // inmutable en estado de React para que la interfaz se actualice cuando cambia.
  const [localItems, setLocalItems] = useState(() => new Map())
  const [ready, setReady] = useState(false)
  const publish = useCallback(() => setLocalItems(new Map(storeRef.current)), [])

  const getQueue = useCallback(() => {
    if (!queueRef.current) {
      queueRef.current = createDownloadQueue({
        limit: MAX_CONCURRENT_COPIES,
        onChange: (state) => {
          for (const entry of state.values()) {
            if (entry.status === 'error' && /espacio/i.test(errorText(entry.error))) outOfSpaceRef.current = true
          }
        },
        run: async (task, { signal }) => {
          const result = await copySongToLocal({ api: localAudioApi, id: task.id, meta: task.meta, signal, url: task.url })
          if (result.status === 'saved') {
            storeRef.current.set(task.id, result.item)
          } else {
            // Ya había copia (p. ej. creada en otra sesión): se recarga el índice local.
            for (const item of await localAudioApi.list()) storeRef.current.set(item.id, item)
          }
          publish()
        },
      })
    }
    return queueRef.current
  }, [publish])

  // Carga de las copias existentes + adaptador de reproducción.
  useEffect(() => {
    if (!desktop) return undefined
    let cancelled = false
    const uninstall = installLocalMediaSource({ has: (id) => storeRef.current.has(id), urlFor: localAudioUrl })

    localAudioApi.list()
      .then((items) => {
        if (cancelled) return
        for (const item of items) storeRef.current.set(item.id, item)
        publish()
      })
      .catch(() => {})
    const timer = setTimeout(() => setReady(true), STARTUP_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      uninstall()
      queueRef.current?.cancelAll()
    }
  }, [desktop, publish])

  // Espejo: lo descargado en el servidor y aún sin copia local se baja al disco.
  const serverItems = base.downloads.items
  useEffect(() => {
    if (!desktop || !ready || !base.online || outOfSpaceRef.current) return
    const queue = getQueue()
    for (const item of serverItems) {
      if (storeRef.current.has(item.id)) continue
      queue.enqueue(item.id, { id: item.id, meta: item, url: `${API_BASE}/downloads/${item.id}/audio` })
    }
  }, [base.online, desktop, getQueue, localItems, ready, serverItems])

  const baseDelete = base.deleteDownload
  const deleteDownload = useCallback(async (id) => {
    queueRef.current?.cancel(id)
    await baseDelete(id)
    if (!desktop) return
    await localAudioApi.remove(id).catch(() => {})
    storeRef.current.delete(id)
    queueRef.current?.forget(id)
    publish()
  }, [baseDelete, desktop, publish])

  const baseIsDownloaded = base.isDownloaded
  const isDownloaded = useCallback((id) => baseIsDownloaded(id) || storeRef.current.has(id), [baseIsDownloaded])

  // Las descargas solo locales (el servidor no responde o ya no las tiene) siguen en la lista.
  const items = useMemo(() => {
    if (!desktop) return serverItems
    const serverIds = new Set(serverItems.map((item) => item.id))
    const localOnly = [...localItems.values()]
      .filter((item) => !serverIds.has(item.id))
      .map((item) => ({ ...item.meta, local: true }))
    return localOnly.length ? [...serverItems, ...localOnly] : serverItems
  }, [desktop, localItems, serverItems])
  const downloadedIds = useMemo(() => new Set(items.map((item) => item.id)), [items])

  return useMemo(() => {
    if (!desktop) return base
    return { ...base, deleteDownload, downloadedIds, downloads: { ...base.downloads, items }, isDownloaded }
  }, [base, deleteDownload, desktop, downloadedIds, isDownloaded, items])
}
