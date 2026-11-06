import { useSyncExternalStore } from 'react'

// Puente entre la vista de YouTube Music (dueña del estado de la cuenta vinculada) y el menú de
// usuario de la barra de título, que vive en otro punto del árbol. Es un almacén mínimo: la vista
// publica una instantánea y el menú la lee. Las instantáneas son inmutables y solo cambian cuando
// cambia algo visible, así que los suscriptores no se repintan de más.

let snapshot = null
const listeners = new Set()

/** Publica el estado de la cuenta (o `null` para retirar las opciones del menú). */
export function setAccountMenu(next) {
  const same = snapshot === next
    || (snapshot && next
      && snapshot.connected === next.connected
      && snapshot.busy === next.busy
      && snapshot.syncBusy === next.syncBusy
      && snapshot.actions === next.actions)
  if (same) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => snapshot

/** Estado actual de la cuenta de YouTube Music para el menú de usuario, o `null` si no aplica. */
export function useAccountMenu() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
