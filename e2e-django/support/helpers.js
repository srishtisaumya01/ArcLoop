import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect } from '@playwright/test'

export const PASSWORD = 'plum-ladder-orbit-42'
export const WEB_ORIGIN = 'http://127.0.0.1:5300' // the app AND the API: `/api/` is proxied to Django on the same origin
export const OTHER_ORIGIN_API = 'http://127.0.0.1:8100/api/v1' // Django itself, a different origin from the page (a different port)
export const SESSION_COOKIE = 'arcloop_session' // the server's names: kept in step with the frontend by tests/integration/authContract
export const CSRF_COOKIE = 'arcloop_csrf'
const EMAIL_DIR = resolve('e2e-django', '.tmp', 'emails')

export { uniqueEmail } from '../../tests/support/uniqueEmail.js'

// Registers through the real sign-up form. Registration signs the user in, so the app opens straight away.
export async function signUpViaForm(page, email, password = PASSWORD) {
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/app$/)
}

export async function logInViaForm(page, email, password = PASSWORD) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible({ timeout: 30000 }) // the dev server can be slow to serve a cold page
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

// The signed-in navigation: in the bar on desktop, behind the menu button on a phone.
export async function openNav(page) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) {
    await menu.click()
    return page.getByRole('navigation', { name: 'Mobile' })
  }
  return page.getByRole('navigation', { name: 'App' })
}

// A cookie of this browser context, as the browser stores it (including flags the page cannot see), or null.
export async function cookieOf(context, name) {
  return (await context.cookies()).find((c) => c.name === name) ?? null
}

// On a desktop the button is in the header; on a phone it is in the menu drawer. Only one is ever visible.
export async function logOut(page) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect.poll(() => cookieOf(page.context(), SESSION_COOKIE)).toBeNull() // where the app lands afterwards depends on the page it was on
}

// Direct API calls AS a signed-in browser context: its cookies are sent by the browser's own jar, and (like the app) it
// echoes the CSRF cookie in the header for writes. `csrf: false` leaves the header out, to show the server refusing it;
// `headers` adds or overrides any header (for example a hostile Origin).
export function apiAs(context) {
  const call = async (method, path, { data, csrf = true, headers = {} } = {}) => {
    const sent = { ...headers }
    if (csrf && !['GET', 'HEAD'].includes(method)) {
      const cookie = await cookieOf(context, CSRF_COOKIE)
      if (cookie) sent['X-CSRFToken'] = cookie.value
    }
    const response = await context.request.fetch(`/api/v1${path}`, { method, headers: sent, data })
    return { status: response.status(), headers: response.headers(), body: await response.json().catch(() => null) }
  }
  return {
    get: (path, options) => call('GET', path, options),
    post: (path, data, options) => call('POST', path, { ...options, data }),
    patch: (path, data, options) => call('PATCH', path, { ...options, data }),
    delete: (path, options) => call('DELETE', path, options),
  }
}

// The password-reset link from the newest email the test server wrote. The email backend writes files, so
// nothing is ever sent; the link is the one the real reset endpoint generated.
export function latestResetLink(to) {
  const files = readdirSync(EMAIL_DIR).map((f) => join(EMAIL_DIR, f)).sort()
  for (const file of files.reverse()) {
    const text = readFileSync(file, 'utf8')
    if (!new RegExp(`^To: .*${to.replace(/[.+]/g, '\\$&')}`, 'm').test(text)) continue
    const link = text.match(/http:\/\/\S+\/update-password\?uid=\S+&token=\S+/)
    if (link) return link[0]
  }
  throw new Error(`no reset email for ${to}`)
}
