import { readFile } from 'node:fs/promises'
import { expect, test } from '../e2e/support/fixtures.js'
import { parseIcs } from '../tests/support/icsParse.js'

// The production build under the enforced policy. Every page is opened and used; any `securitypolicyviolation`
// event or "Refused to ..." console message fails the test. Then the policy is shown to really block things, so a
// silently permissive policy cannot pass.

const PUBLIC = ['/', '/challenges', '/how-it-works', '/participants', '/faq', '/login', '/signup', '/forgot-password', '/privacy', '/terms', '/contact', '/no-such-page']
const APP = ['/app', '/app/day', '/app/week', '/app/progress', '/app/recurring', '/app/reminders', '/app/settings']

async function watch(page) {
  const refused = []
  page.on('console', (m) => /Refused to|Content Security Policy|Content-Security-Policy/i.test(m.text()) && refused.push(m.text().slice(0, 200)))
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}`))
  })
  return refused
}
const violations = (page) => page.evaluate(() => window.__violations)

test('the policy header is the enforced one, with no unsafe directives', async ({ page }) => {
  const response = await page.goto('/login')
  const policy = response.headers()['content-security-policy']
  expect(policy).toContain("default-src 'none'")
  expect(policy).toContain("script-src 'self'")
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|\*|data:/)
  expect(response.headers()['content-security-policy-report-only']).toBeUndefined()
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
})

test.describe('no violations anywhere in the app', () => {
  test.describe('signed out', () => {
    test.use({ signedIn: false })
    for (const route of PUBLIC) {
      test(route, async ({ page }) => {
        const refused = await watch(page)
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('h1').first()).toBeVisible()
        expect(await violations(page)).toEqual([])
        expect(refused).toEqual([])
      })
    }
  })

  for (const route of APP) {
    test(route, async ({ page }) => {
      const refused = await watch(page)
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await violations(page)).toEqual([])
      expect(refused).toEqual([])
    })
  }

  test('using the interface (menus, dialogs, selects, forms) adds none either', async ({ page }, testInfo) => {
    const refused = await watch(page)
    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByRole('dialog', { name: 'Delete your account?' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep my account' }).click()
    await page.getByLabel('Timezone').click()
    await page.keyboard.press('Escape')
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click()
      await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
    }
    await page.goto('/app/day')
    await expect(page.getByText('Morning walk')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeChecked()
    await page.goto('/app/reminders')
    await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible()
    expect(await violations(page)).toEqual([])
    expect(refused).toEqual([])
  })
})

test('the app still looks like the app under the policy (styles and fonts are applied, not silently dropped)', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const look = await page.evaluate(async () => {
    await document.fonts.ready
    const h1 = document.querySelector('h1')
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      h1Font: getComputedStyle(h1).fontFamily,
      h1Size: parseFloat(getComputedStyle(h1).fontSize),
      fontLoaded: [...document.fonts].some((f) => /Plus Jakarta/.test(f.family) && f.status === 'loaded'),
      emotionRules: [...document.querySelectorAll('style[data-emotion]')].reduce((n, s) => n + (s.sheet?.cssRules.length ?? 0), 0),
    }
  })
  expect(look.emotionRules).toBeGreaterThan(50) // MUI/Emotion rules were inserted, so the style elements were admitted
  expect(look.bodyBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(look.h1Font).toMatch(/Plus Jakarta/)
  expect(look.h1Size).toBeGreaterThan(24)
  expect(look.fontLoaded).toBe(true) // the self-hosted font file was fetched (font-src 'self')
})

test('the calendar file still downloads under the policy, with no violation', async ({ page }) => {
  const refused = await watch(page)
  await page.goto('/app/reminders')
  const card = page.getByRole('region', { name: 'Calendar export' })
  const download = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download .ics file' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('arcloop-plan-2026-03-10-to-2026-03-23.ics')
  expect(parseIcs(await readFile(await file.path(), 'utf8')).events.length).toBeGreaterThan(0)
  await expect(card.getByRole('status')).toContainText('Saved arcloop-plan')
  expect(await violations(page)).toEqual([])
  expect(refused).toEqual([])
})

test.describe('the policy really blocks', () => {
  test('injected inline script, inline style markup, foreign requests', async ({ page }) => {
    await watch(page)
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // 1. An inline script (what an XSS payload would try) does not run.
    const ran = await page.evaluate(() => {
      const script = document.createElement('script')
      script.textContent = 'window.__injected = true'
      document.head.append(script)
      return window.__injected === true
    })
    expect(ran).toBe(false)
    // 2. Markup with an inline event handler does not run either.
    const handler = await page.evaluate(() => {
      const holder = document.createElement('div')
      holder.innerHTML = '<img src="x" onerror="window.__handler = true">'
      document.body.append(holder)
      return new Promise((resolve) => setTimeout(() => resolve(window.__handler === true), 300))
    })
    expect(handler).toBe(false)
    // 3. Inline style attributes in markup are refused (strict style-src).
    await page.evaluate(() => {
      const holder = document.createElement('div')
      holder.innerHTML = '<p id="styled" style="color: rgb(255, 0, 0)">x</p>'
      document.body.append(holder)
    })
    expect(await page.locator('#styled').evaluate((el) => getComputedStyle(el).color)).not.toBe('rgb(255, 0, 0)')
    // 4. Requests to any other origin are refused.
    const foreign = await page.evaluate(() => fetch('https://example.com/').then(() => 'allowed', () => 'blocked'))
    expect(foreign).toBe('blocked')
    // 5. The recorded violations include these.
    const seen = (await violations(page)).join(' | ')
    expect(seen).toMatch(/script-src/)
    expect(seen).toMatch(/connect-src/)
  })
})
