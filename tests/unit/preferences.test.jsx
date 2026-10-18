import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ThemeModeProvider from '../../src/context/ThemeModeProvider.jsx'
import I18nProvider from '../../src/context/I18nProvider.jsx'
import AuthProvider from '../../src/context/AuthProvider.jsx'
import { routes } from '../../src/app/router.jsx'

// The same providers the real app wraps around its routes, so the language and theme switches work for real.
function renderApp(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <ThemeModeProvider>
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </ThemeModeProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.lang = 'en'
})

describe('language', () => {
  it('switches the navigation and the page to Hindi, sets <html lang>, and remembers the choice', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'How it works' })).toBeInTheDocument()

    const switchTo = (name) => screen.getAllByRole('button', { name }).find((b) => b.closest('[role="group"]'))
    expect(switchTo('English')).toHaveAttribute('aria-pressed', 'true')
    expect(switchTo('हिन्दी')).toHaveAttribute('aria-pressed', 'false')
    await user.click(switchTo('हिन्दी'))

    expect(await within(nav).findByRole('link', { name: 'यह कैसे काम करता है' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('आदतें बनाइए। बढ़ते रहिए।')
    expect(document.documentElement.lang).toBe('hi')
    expect(localStorage.getItem('arcloop.lang')).toBe('hi')
    // ...and back again.
    expect(switchTo('हिन्दी')).toHaveAttribute('aria-pressed', 'true')
    await user.click(switchTo('English'))
    expect(await within(nav).findByRole('link', { name: 'How it works' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('starts in the language saved earlier', async () => {
    localStorage.setItem('arcloop.lang', 'hi')
    renderApp('/faq')
    expect(await screen.findByRole('heading', { level: 1, name: 'अक्सर पूछे जाने वाले सवाल' })).toBeInTheDocument()
  })
})

describe('theme', () => {
  it('switches between the light and dark theme and remembers the choice', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(document.documentElement.dataset.theme).toBe('light')

    await user.click(screen.getAllByRole('button', { name: 'Switch to dark theme' })[0])
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('arcloop.theme')).toBe('dark')

    await user.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0])
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('starts in the theme saved earlier', async () => {
    localStorage.setItem('arcloop.theme', 'dark')
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getAllByRole('button', { name: 'Switch to light theme' }).length).toBeGreaterThan(0)
  })
})
