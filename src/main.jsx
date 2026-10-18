import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/noto-sans-devanagari'
import '@fontsource-variable/outfit'
import App from './app/App.jsx'
import { applyMode, initialMode } from './theme/themeMode.js'
import { applyLang, initialLang } from './i18n/languages.js'
import './styles/global.css'

// Set the theme before the first render so a dark-mode visitor never sees a light flash.
applyMode(initialMode())
applyLang(initialLang())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
