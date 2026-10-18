import { useCallback, useEffect, useMemo, useState } from 'react'
import { I18nContext } from './i18nContext.js'
import { LANG_STORAGE_KEY, applyLang, initialLang } from '../i18n/languages.js'
import { makeTranslator } from '../i18n/translate.js'

// English or Hindi: the saved choice, else English. Sets <html lang> so browsers and screen readers pick the right voice.
export default function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)

  useEffect(() => {
    applyLang(lang)
  }, [lang])

  const setLang = useCallback((next) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // Remembering the choice is a convenience only.
    }
  }, [])

  const value = useMemo(() => ({ lang, setLang, ...makeTranslator(lang) }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
