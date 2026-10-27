export function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved !== null ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // El almacenamiento puede no estar disponible en modo privado.
  }
}
