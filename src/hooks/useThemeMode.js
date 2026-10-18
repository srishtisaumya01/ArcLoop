import { useContext } from 'react'
import { ThemeModeContext } from '../context/themeModeContext.js'

export function useThemeMode() {
  return useContext(ThemeModeContext)
}
