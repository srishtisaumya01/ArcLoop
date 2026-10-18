import { createContext } from 'react'
import { makeTranslator } from '../i18n/translate.js'

// Default value lets components render (and tests run) without a provider: English, with the language switch inert.
export const I18nContext = createContext({ lang: 'en', setLang: () => {}, ...makeTranslator('en') })
