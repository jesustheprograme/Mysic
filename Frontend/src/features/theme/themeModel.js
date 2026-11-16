// Tema claro / oscuro de Mysic. Lógica pura (sin React) para poder probarla; el hook useTheme la usa.
export const THEME_KEY = 'mysic:theme'
export const THEMES = ['dark', 'light']
export const DEFAULT_THEME = 'dark'
/** Duración del fundido de colores al cambiar de tema (coincide con duration-300 de index.css). */
export const THEME_TRANSITION_MS = 300

/** Cualquier valor guardado -> un tema válido. */
export const normalizeTheme = (value) => (THEMES.includes(value) ? value : DEFAULT_THEME)

export function readStoredTheme(storage = globalThis.localStorage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(theme, storage = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_KEY, normalizeTheme(theme))
  } catch {
    // Sin almacenamiento: el tema vale solo para esta sesión.
  }
}

export const nextTheme = (theme) => (theme === 'light' ? 'dark' : 'light')

/** Color de la barra del sistema por tema (meta theme-color). */
export const THEME_COLORS = { dark: '#0b0c0e', light: '#f5f7f7' }

/** Marca el documento: data-theme para el CSS claro generado, .dark para las variantes dark: de Tailwind y color-scheme. */
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return
  const value = normalizeTheme(theme)
  root.dataset.theme = value
  root.classList.toggle('dark', value === 'dark')
  root.style.colorScheme = value
  globalThis.document?.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[value])
}