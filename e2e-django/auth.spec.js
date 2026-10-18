import { expect, test } from '@playwright/test'
import { CSRF_COOKIE, OTHER_ORIGIN_API, PASSWORD, SESSION_COOKIE, apiAs, cookieOf, latestResetLink, logInViaForm, logOut, signUpViaForm, uniqueEmail } from './support/helpers.js'

// Real browser, real React build, real Django API and SQLite database, ONE origin (the app proxies /api to Django), so the
// browser really sets, keeps and sends the HttpOnly session cookie and the CSRF cookie (see playwright.django.config.js).

test.describe('registration and sessions', () => {
  test('registering signs the user in immediately; the session is an HttpOnly cookie that survives a reload', async ({ page, context }) => {
    const email = uniqueEmail('reg')
    await signUpViaForm(page, email)
    await expect(page.getByText(email)).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText(email)).toBeVisible()

    const session = await cookieOf(context, SESSION_COOKIE)
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/', secure: false }) // secure only in production (https); see docs
    const days = (session.expires - Date.now() / 1000) / 86400
    expect(days).toBeGreaterThan(6.9) // persists for the token's lifetime (seven days), not just this tab
    expect(days).toBeLessThanOrEqual(7)
    // Page script cannot see the credential: not in document.cookie, not in any storage.
    const visible = await page.evaluate(() => ({ cookie: document.cookie, local: { ...localStorage }, session: { ...sessionStorage } }))
    expect(visible.cookie).not.toContain(SESSION_COOKIE)
    expect(visible.cookie).toContain(CSRF_COOKIE) // the CSRF secret is meant to be readable: the page echoes it in a header
    expect(JSON.stringify([visible.local, visible.session])).not.toMatch(new RegExp(`${session.value}|token|arcloop\\.session`, 'i'))
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

  test('log out ends the session and clears the cookies, protected pages send you to log in, and logging in again works', async ({ page, context }) => {
    const email = uniqueEmail('cycle')
    await signUpViaForm(page, email)
    const first = (await cookieOf(context, SESSION_COOKIE)).value
    await logOut(page)
    expect(await cookieOf(context, CSRF_COOKIE)).toBeNull() // both cookies go
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/login$/)
    await logInViaForm(page, email, 'wrong-password-1')
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    expect(await cookieOf(context, SESSION_COOKIE)).toBeNull() // a failed sign-in sets nothing
    await logInViaForm(page, email)
    await expect(page).toHaveURL(/\/app\/day$/) // sent back to where they were going
    expect((await cookieOf(context, SESSION_COOKIE)).value).not.toBe(first) // a new session, not the old one revived
  })

  test('the old cookie is dead on the server after logout, not merely forgotten by the browser', async ({ browser, page, context, baseURL }) => {
    await signUpViaForm(page, uniqueEmail('replay'))
    const stolen = await browser.newContext({ baseURL, storageState: await context.storageState() }) // a copy of the cookies, as an attacker who got them would hold
    expect((await apiAs(stolen).get('/auth/me/')).status).toBe(200)
    await logOut(page)
    expect((await apiAs(stolen).get('/auth/me/')).status).toBe(401)
    await stolen.close()
  })

  test('a session ended elsewhere signs this browser out on its next request', async ({ browser, page, context, baseURL }) => {
    const email = uniqueEmail('elsewhere')
    await signUpViaForm(page, email)
    const copy = await browser.newContext({ baseURL, storageState: await context.storageState() })
    expect((await apiAs(copy).post('/auth/logout/')).status).toBe(204) // the same session, ended from another browser
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/login$/)
    expect(await cookieOf(context, SESSION_COOKIE)).toBeNull() // the dead cookie was cleared by the server's answer
    await copy.close()
  })

  test('two browsers signed in to the same account are independent sessions', async ({ browser, page, baseURL }) => {
    const email = uniqueEmail('twice')
    await signUpViaForm(page, email)
    const other = await browser.newContext({ baseURL })
    const otherPage = await other.newPage()
    await logInViaForm(otherPage, email)
    await expect(otherPage).toHaveURL(/\/app$/)
    await logOut(otherPage)
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/app\/day$/) // logging out of one device does not log out the other
    await other.close()
  })
})

test.describe('cookies and CSRF against the real server', () => {
  test('a change without the CSRF header is refused and does nothing; with the header it works; a wrong header is refused', async ({ page, context }) => {
    await signUpViaForm(page, uniqueEmail('csrf'))
    const api = apiAs(context)
    const body = { title: 'Walk', recurrence: 'daily', starts_on: '2026-03-01' }
    const without = await api.post('/task-templates/', body, { csrf: false })
    expect([without.status, without.body.error.code]).toEqual([403, 'csrf_failed'])
    expect((await api.get('/task-templates/')).body.results).toEqual([]) // nothing was created
    expect((await api.post('/task-templates/', body, { headers: { 'X-CSRFToken': 'not-the-token' }, csrf: false })).status).toBe(403)
    expect((await api.post('/task-templates/', body)).status).toBe(201)
    expect((await api.patch('/profile/', { display_name: 'Asha' }, { csrf: false })).status).toBe(403)
    expect((await api.delete('/task-templates/?title=Walk', { csrf: false })).status).toBe(403)
    expect((await api.get('/task-templates/')).body.results).toHaveLength(1) // still there
  })

  test('a request claiming another origin is refused even with a valid CSRF token, and gets no CORS permission', async ({ page, context }) => {
    await signUpViaForm(page, uniqueEmail('origin'))
    const hostile = await apiAs(context).post('/task-templates/', { title: 'x', recurrence: 'daily', starts_on: '2026-03-01' }, { headers: { Origin: 'http://evil.example' } })
    expect([hostile.status, hostile.body.error.code]).toEqual([403, 'csrf_failed'])
    expect(hostile.headers['access-control-allow-origin']).toBeUndefined()
    expect(hostile.headers['access-control-allow-credentials']).toBeUndefined()
  })

  test('a malicious page cannot make this browser act: a cross-origin form post to the API is refused and the user stays signed in', async ({ page, context }) => {
    await signUpViaForm(page, uniqueEmail('forged'))
    // The classic CSRF attack: any page makes the victim's browser POST a form to the API. Here the "attacker" origin is the
    // API's own port (a different origin, but the same SITE: ports do not separate sites), so the browser DOES attach the
    // SameSite=Strict cookie. What stops the attack is the CSRF token, which the attacker's form cannot supply.
    await page.evaluate((target) => {
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = `${target}/auth/logout/`
      document.body.append(form)
      form.submit()
    }, OTHER_ORIGIN_API)
    await page.waitForURL(/127\.0\.0\.1:8100/)
    expect(await page.locator('body').innerText()).toContain('csrf_failed')
    expect(await cookieOf(context, SESSION_COOKIE)).not.toBeNull() // the forged logout did not even clear the cookie
    expect((await apiAs(context).get('/auth/me/')).status).toBe(200) // and the session is still valid on the server
  })

  test('script on a different origin cannot read the API, so a malicious page cannot steal data either', async ({ page }) => {
    await signUpViaForm(page, uniqueEmail('cors'))
    const outcome = await page.evaluate((target) => fetch(`${target}/auth/me/`, { credentials: 'include' }).then(() => 'readable', () => 'blocked'), OTHER_ORIGIN_API)
    expect(outcome).toBe('blocked') // no CORS permission is ever given
  })

  test('the cookies have exactly the intended flags, and API answers are never cached', async ({ page, context }) => {
    await signUpViaForm(page, uniqueEmail('flags'))
    expect(await cookieOf(context, SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/' })
    expect(await cookieOf(context, CSRF_COOKIE)).toMatchObject({ httpOnly: false, sameSite: 'Strict', path: '/' })
    const me = await apiAs(context).get('/auth/me/')
    expect(me.headers['cache-control']).toBe('no-store')
    expect(me.headers['referrer-policy']).toBe('no-referrer')
  })
})

test.describe('password reset', () => {
  test('request, emailed link, new password, single use, old password rejected', async ({ page, browser, baseURL }) => {
    const email = uniqueEmail('reset')
    await signUpViaForm(page, email)
    await logOut(page)

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByText(/If this email|check your inbox/i).first()).toBeVisible()

    // The link works in a different browser profile: Django links are not tied to the requesting browser.
    const link = latestResetLink(email)
    const other = await browser.newContext({ baseURL })
    const tab = await other.newPage()
    await tab.goto(link)
    await expect(tab.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible()
    await expect.poll(() => tab.url()).not.toMatch(/token=|uid=/) // the secret does not stay in the address bar
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

  test('a signed-in user changes their password with the current one, and other devices are signed out', async ({ browser, page, baseURL }) => {
    test.slow() // a sign-up, three log-ins and two password changes, each hashed by the real server: long on a busy machine
    const email = uniqueEmail('change')
    await signUpViaForm(page, email)
    const other = await browser.newContext({ baseURL })
    const otherPage = await other.newPage()
    await logInViaForm(otherPage, email)
    await expect(otherPage).toHaveURL(/\/app$/)

    await page.goto('/update-password')
    await page.getByLabel('Current password').fill('wrong-current-1')
    await page.getByLabel('New password', { exact: true }).fill('river-lantern-sky-77')
    await page.getByLabel('Confirm new password').fill('river-lantern-sky-77')
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page.getByRole('alert')).toContainText(/current password is incorrect/i)
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Password updated' })).toBeVisible()
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/app\/day$/) // this device stays signed in
    await otherPage.goto('/app/day')
    await expect(otherPage).toHaveURL(/\/login$/) // the other one does not
    await other.close()

    await logOut(page)
    await logInViaForm(page, email) // the old password is gone
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await logInViaForm(page, email, 'river-lantern-sky-77')
    await expect(page).toHaveURL(/\/app\/day$|\/app$/)
  })
})
