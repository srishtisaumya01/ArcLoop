import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import AuthProvider from '../../src/context/AuthProvider.jsx'
import { routes } from '../../src/app/router.jsx'

export function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <ThemeProvider theme={theme}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>,
    ),
  }
}
