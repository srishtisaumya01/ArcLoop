import { expect, openNav, test } from './support/fixtures.js'

// Release-readiness checks in a real browser: heading structure on every signed-in screen, and what a person sees
// when a page cannot be loaded because the connection dropped. Arcloop has no offline mode; this only proves the
// failure is explained calmly. Stubbed API endpoints (e2e/support/stubApi.js), so nothing here touches a real server.

const SCREENS = ['/app/day', '/app/week', '/app/progress', '/app/recurring', '/app/reminders', '/app/settings']

test.describe('heading structure', () => {
  for (const route of SCREENS) {
    test(`${route} has one h1 and never skips a level`, async ({ page }) => {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await page.waitForLoadState('networkidle')
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])))
      levels.forEach((level, i) => {
        if (i > 0) expect(level - levels[i - 1], `heading ${i} (h${level}) after h${levels[i - 1]}`).toBeLessThanOrEqual(1)
      })
    })
  }
})

test('opening a page while offline explains it calmly, keeps the navigation, and recovers when back online', async ({ page, context }, testInfo) => {
  await page.goto('/app/day')
  await expect(page.getByText('Morning walk')).toBeVisible()
  await context.setOffline(true)
  await (await openNav(page, testInfo)).getByRole('link', { name: 'Week' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'This page didn’t load' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('You seem to be offline')
  await expect(page.getByText('Hey developer')).toHaveCount(0)
  await expect(page.getByRole('banner')).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your week' })).toBeVisible()
})
