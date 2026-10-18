export const LANG_STORAGE_KEY = 'arcloop.lang'

// `short` is what the language switch shows for the language you would switch TO.
export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
]

export const isSupported = (code) => LANGUAGES.some((l) => l.code === code)

export function readStoredLang() {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY)
    return isSupported(value) ? value : null
  } catch {
    return null
  }
}

// The saved choice, else English (a visitor can switch to Hindi in one tap).
export const initialLang = () => readStoredLang() ?? 'en'

export function applyLang(lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
