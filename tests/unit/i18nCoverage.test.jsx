import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import fs from 'node:fs'
import theme from '../../src/theme/theme.js'
import AuthProvider from '../../src/context/AuthProvider.jsx'
import { I18nContext } from '../../src/context/i18nContext.js'
import { interpolate, richText } from '../../src/i18n/translate.js'
import { hi } from '../../src/i18n/hi.js'
import { routes } from '../../src/app/router.jsx'

// Renders every public page in Hindi and records each text the page asked to translate, so a sentence added to a page
// without a Hindi translation fails here instead of silently showing English to Hindi readers.
function renderRecording(path, seen) {
  const t = (text, vars) => {
    seen.add(text)
    return interpolate(hi[text] ?? text, vars)
  }
  const tx = (text, nodes) => {
    seen.add(text)
    return richText(hi[text] ?? text, nodes)
  }
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <ThemeProvider theme={theme}>
      <I18nContext.Provider value={{ lang: 'hi', setLang: () => {}, t, tx }}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nContext.Provider>
    </ThemeProvider>,
  )
}

const PAGES = [
  ['/', { level: 1 }],
  ['/how-it-works', { level: 1 }],
  ['/faq', { level: 1 }],
  ['/challenges', { level: 1 }],
  ['/challenges/winter-arc-90', { level: 1 }],
  ['/challenges/weekly-review-circle', { level: 1 }],
  ['/participants', { level: 1 }],
  ['/contact', { level: 1 }],
  ['/login', { level: 1 }],
  ['/signup', { level: 1 }],
  ['/forgot-password', { level: 1 }],
  ['/update-password', { level: 1 }],
  ['/nope', { level: 1 }],
]

// Messages that only appear after something happens (validation, server replies), so no page render shows them.
const EVENT_TEXTS = [
  'Enter your email address.',
  'Enter a valid email address, like name@example.com.',
  'Enter your password.',
  'Create a password.',
  'Use at least 8 characters.',
  'Please agree to continue.',
  'Re-enter your new password.',
  'The passwords do not match.',
  'Enter your current password.',
  'Choose a topic.',
  'Write a short message.',
  'Keep it under 2000 characters.',
  'Switch to light theme',
  'Hide password',
  'Open email again',
  'Your email app should open with your message ready. It has not been sent yet: press send there. If nothing opens, write to {email}.',
  'No questions match your search',
  'Try a different word, or clear the search to see everything.',
  'Clear search',
  'Clear filters',
  'Try again',
  'We couldn’t load challenges',
  'Something went wrong while loading. Please try again.',
  'No challenges match your search',
  'Try a different word, or clear the filters to see everything.',
  'We couldn’t load this challenge',
  'Challenge not found',
  'This challenge doesn’t exist, or the link is out of date.',
  'Log out',
  'Open app',
  'Almost there',
  'Check your inbox',
  'Use a different email',
  'If this email can be used to create an account, we have sent a confirmation link to it. Open the link to finish signing up. If nothing arrives in a few minutes, check your spam folder.',
  'If an account exists for that email, we have sent a link to choose a new password. The link works in the browser you requested it from.',
  'Password updated',
  'Continue',
  'Cancel',
  'Update password',
  'Saving…',
  'Current password',
  'New password',
  'Confirm new password',
  'Pick something you have not used elsewhere.',
  'Your password has been changed. Log in with it to continue.',
  'Your password has been changed. You are logged in on this device.',
  'Something went wrong',
  'This page didn’t load',
  'You seem to be offline. Arcloop needs a connection to open pages and your plans. Nothing you saved is lost.',
  'Something went wrong while opening this page. Nothing you saved is lost.',
  'Starts in {time}',
  'Challenge complete',
  'Starting soon',
  'Completed',
  'Last day today',
]

// Words that are the same in Hindi (brand and product names, symbols, single letters) need no entry.
const SAME_IN_HINDI = new Set(['Arcloop', 'Winter Arc 90', 'FAQ'])

describe('Hindi coverage', () => {
  it('has a translation for every text the public pages show', async () => {
    const seen = new Set()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [path, heading] of PAGES) {
      const { unmount } = renderRecording(path, seen)
      await screen.findByRole('heading', heading)
      // Cards load a moment after the page header.
      if (path === '/challenges') await screen.findByRole('heading', { name: hi['Morning movement'] })
      unmount()
    }
    // Extra states: the FAQ answers, validation messages and the join preview.
    const user = userEvent.setup()
    {
      const { unmount } = renderRecording('/contact', seen)
      await user.click(await screen.findByRole('button', { name: hi['Send message'] }))
      unmount()
    }
    const { unmount } = renderRecording('/challenges/morning-movement', seen)
    await user.click(await screen.findByRole('button', { name: hi['Join challenge'] }))
    unmount()

    EVENT_TEXTS.forEach((text) => seen.add(text))
    if (process.env.DUMP_I18N_KEYS) fs.writeFileSync(process.env.DUMP_I18N_KEYS, JSON.stringify([...seen].sort(), null, 2))
    const missing = [...seen].filter((text) => !(text in hi) && !SAME_IN_HINDI.has(text) && /[A-Za-z]{2}/.test(text))
    expect(missing).toEqual([])
  }, 90000)
})
