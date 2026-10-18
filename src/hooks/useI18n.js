import { useContext } from 'react'
import { I18nContext } from '../context/i18nContext.js'

export function useI18n() {
  return useContext(I18nContext)
}
