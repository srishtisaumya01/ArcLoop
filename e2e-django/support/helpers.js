import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect } from '@playwright/test'

export const PASSWORD = 'plum-ladder-orbit-42'
export const API = 'http://127.0.0.1:8100/api/v1'
export const WEB_ORIGIN = 'http://127.0.0.1:5300'
const EMAIL_DIR = resolve('e2e-django', '.tmp', 'emails')

let counter = 0
// Unique per run and per call, so tests never collide on one shared database.
export const uniqueEmail = (label) => `${label}-${Date.now().toString(36)}${(counter += 1)}@example.com`

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

// On a desktop the button is in the header; on a phone it is in the menu drawer. Only one is ever visible.
export async function logOut(page) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect.poll(() => tokenOf(page)).toBeNull() // where the app lands afterwards depends on the page it was on
}

// The bearer token the app stored for this browser (the only place the test needs to read it).
export const tokenOf = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('arcloop.session') ?? 'null')?.token ?? null)

// Direct API call with a given token, from the test runner (a different origin from the app, like a hostile client).
export async function apiCall(request, method, path, token, data) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data,
  })
  return { status: response.status(), body: await response.json().catch(() => null) }
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
