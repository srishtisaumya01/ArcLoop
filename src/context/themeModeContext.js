import { createContext } from 'react'

// Default value lets components render (and tests run) without a provider: light theme, toggling does nothing.
export const ThemeModeContext = createContext({ mode: 'light', setMode: () => {}, toggleMode: () => {} })
