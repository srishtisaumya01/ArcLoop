export const THEME_STORAGE_KEY = 'arcloop.theme'

export function readStoredMode() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function systemMode() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// The saved choice, else the device's preference.
export const initialMode = () => readStoredMode() ?? systemMode()

// Marks <html> with the theme so the CSS variables switch (see styles/global.css).
export function applyMode(mode) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = mode
}
