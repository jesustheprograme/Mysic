import { useSyncExternalStore } from 'react'
import { getToast, subscribeToast } from './toast.js'

/** Se monta una vez; anuncia el aviso a lectores de pantalla (role="status"). */
export default function ToastHost() {
  const toast = useSyncExternalStore(subscribeToast, getToast, () => null)
  return (
    <div className="mysic-toast-region" role="status" aria-live="polite">
      {toast && <div className="mysic-toast" key={toast.id}>{toast.message}</div>}
    </div>
  )
}
