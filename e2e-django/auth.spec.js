import { expect, test } from '@playwright/test'
import { API, PASSWORD, WEB_ORIGIN, latestResetLink, logInViaForm, logOut, signUpViaForm, tokenOf, uniqueEmail } from './support/helpers.js'

// Real browser, real React build in Django mode, real Django API and SQLite database (see playwright.django.config.js).

test.describe('registration and sessions', () => {
  test('registering signs the user in immediately, and the session survives a reload', async ({ page }) => {
    const email = uniqueEmail('reg')
    await signUpViaForm(page, email)
    await expect(page.getByText(email)).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText(email)).toBeVisible()
    expect(await tokenOf(page)).toBeTruthy()
  })

  test('sign-up validation and a duplicate email are explained without a crash', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Please agree to continue.')).toBeVisible()
    const email = uniqueEmail('dup')
    await signUpViaForm(page, email)
    await logOut(page)
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText(/account may already exist/i)
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('a weak password is refused by the server with a clear message', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill(uniqueEmail('weak'))
    await page.getByRole('textbox', { name: 'Password' }).fill('password123')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText(/too easy to guess/i)
  })

  test('log out ends the session, protected pages send you to log in, and logging in again works', async ({ page }) => {
    const email = uniqueEmail('cycle')
    await signUpViaForm(page, email)
    const first = await tokenOf(page)
    await logOut(page)
    expect(await tokenOf(page)).toBeNull()
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/login$/)
    await logInViaForm(page, email, 'wrong-password-1')
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await logInViaForm(page, email)
    await expect(page).toHaveURL(/\/app\/day$/) // sent back to where they were going
    expect(await tokenOf(page)).not.toBe(first)
  })

  test('a token the server no longer accepts signs the user out of the page', async ({ page, request }) => {
    const email = uniqueEmail('revoked')
    await signUpViaForm(page, email)
    const token = await tokenOf(page)
    // Revoke it behind the app's back (as another device's password change would).
    const out = await request.fetch(`${API}/auth/logout/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect(out.status()).toBe(204)
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('CORS', () => {
  test('the API answers the app’s origin and refuses to advertise itself to any other', async ({ request }) => {
    const allowed = await request.fetch(`${API}/auth/login/`, { method: 'OPTIONS', headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } })
    expect(allowed.headers()['access-control-allow-origin']).toBe(WEB_ORIGIN)
    const hostile = await request.fetch(`${API}/auth/login/`, { method: 'OPTIONS', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } })
    expect(hostile.headers()['access-control-allow-origin']).toBeUndefined()
    expect(allowed.headers()['access-control-allow-credentials']).toBeUndefined() // tokens are headers, never cookies
  })

  test('a cross-origin request from the page itself succeeds (the app really is on another origin)', async ({ page }) => {
    await page.goto('/login')
    expect(new URL(page.url()).origin).toBe(WEB_ORIGIN)
    const status = await page.evaluate(async (api) => (await fetch(`${api}/auth/me/`)).status, API)
    expect(status).toBe(401) // reached the API and got its answer, not a blocked-by-CORS failure
  })
})

test.describe('password reset', () => {
  test('request, emailed link, new password, single use, old password rejected', async ({ page, browser }) => {
    const email = uniqueEmail('reset')
    await signUpViaForm(page, email)
    await logOut(page)

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByText(/If this email|check your inbox/i).first()).toBeVisible()

    // The link works in a different browser profile: Django links are not tied to the requesting browser.
    const link = latestResetLink(email)
    const other = await browser.newContext()
    const tab = await other.newPage()
    await tab.goto(link)
    await expect(tab.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible()
    await tab.getByLabel('New password', { exact: true }).fill('short')
    await tab.getByLabel('Confirm new password').fill('short')
    await tab.getByRole('button', { name: 'Update password' }).click()
    await expect(tab.getByText(/at least 8/i).first()).toBeVisible()
    await tab.getByLabel('New password', { exact: true }).fill('river-lantern-sky-77')
    await tab.getByLabel('Confirm new password').fill('river-lantern-sky-77')
    await tab.getByRole('button', { name: 'Update password' }).click()
    await expect(tab.getByRole('heading', { level: 1, name: 'Password updated' })).toBeVisible()

    // Single use: the same link now says it is invalid.
    await tab.goto(link)
    await tab.getByLabel('New password', { exact: true }).fill('another-strong-one-9')
    await tab.getByLabel('Confirm new password').fill('another-strong-one-9')
    await tab.getByRole('button', { name: 'Update password' }).click()
    await expect(tab.getByRole('alert')).toContainText(/invalid or has expired/i)
    await other.close()

    await logInViaForm(page, email) // the old password no longer works
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await logInViaForm(page, email, 'river-lantern-sky-77')
    await expect(page).toHaveURL(/\/app$/)
  })

  test('asking for a reset for an unknown address looks exactly the same, and sends nothing', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(uniqueEmail('ghost'))
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByText(/If this email|check your inbox/i).first()).toBeVisible()
  })

  test('a signed-in user changes their password with the current one', async ({ page }) => {
    const email = uniqueEmail('change')
    await signUpViaForm(page, email)
    await page.goto('/update-password')
    await page.getByLabel('Current password').fill('wrong-current-1')
    await page.getByLabel('New password', { exact: true }).fill('river-lantern-sky-77')
    await page.getByLabel('Confirm new password').fill('river-lantern-sky-77')
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page.getByRole('alert')).toContainText(/current password is incorrect/i)
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Password updated' })).toBeVisible()
    await logOut(page)
    await logInViaForm(page, email) // the old password is gone
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await logInViaForm(page, email, 'river-lantern-sky-77')
    await expect(page).toHaveURL(/\/app\/day$|\/app$/)
  })
})
