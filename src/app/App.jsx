import { RouterProvider } from 'react-router-dom'
import { CssBaseline } from '@mui/material'
import ThemeModeProvider from '../context/ThemeModeProvider.jsx'
import I18nProvider from '../context/I18nProvider.jsx'
import AuthProvider from '../context/AuthProvider.jsx'
import { router } from './router.jsx'

export default function App() {
  return (
    <ThemeModeProvider>
      <I18nProvider>
        <CssBaseline />
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </ThemeModeProvider>
  )
}
