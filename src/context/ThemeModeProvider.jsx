import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from '@mui/material'
import { ThemeModeContext } from './themeModeContext.js'
import { createAppTheme } from '../theme/theme.js'
import { THEME_STORAGE_KEY, applyMode, initialMode, readStoredMode, systemMode } from '../theme/themeMode.js'

// Light or dark theme: the saved choice, else the device's preference (followed live until the person picks one).
export default function ThemeModeProvider({ children }) {
  const [mode, setModeState] = useState(initialMode)

  useEffect(() => {
    applyMode(mode)
  }, [mode])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return undefined
    const follow = () => {
      if (!readStoredMode()) setModeState(systemMode())
    }
    query.addEventListener('change', follow)
    return () => query.removeEventListener('change', follow)
  }, [])

  const setMode = useCallback((next) => {
    setModeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Remembering the choice is a convenience only.
    }
  }, [])

  const value = useMemo(() => ({ mode, setMode, toggleMode: () => setMode(mode === 'dark' ? 'light' : 'dark') }), [mode, setMode])
  const theme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  )
}
