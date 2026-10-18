import { test as base, expect } from '@playwright/test'
import { API_GLOB, CSRF_COOKIE, CSRF_VALUE, NOW_ISO, createStubApi } from './stubApi.js'

// Every test gets its own in-memory API (so writes never leak between tests), a browser clock pinned to
// Tuesday 10 March 2026, 11:00 New York (so "today" matches the seeded data), and, unless a test opts out
// with `test.use({ signedIn: false })`, a signed-in stub session so the signed-in screens open directly (the app asks
// `/auth/me/`, as it does for a real cookie), and the CSRF cookie a real sign-in would have set.
// (Playwright's fixture callback is named `provide` here only because the React hooks lint rule
// objects to a function argument called `use`.)
export const test = base.extend({
  signedIn: [true, { option: true }],
  apiMode: ['normal', { option: true }],
  context: async ({ context, baseURL }, provide) => {
    await context.clock.setFixedTime(new Date(NOW_ISO))
    await context.addCookies([{ name: CSRF_COOKIE, value: CSRF_VALUE, url: baseURL }])
    await provide(context)
  },
  // Automatic, so the stub is attached even when a test never mentions `api`; without it, requests would go to a dead port.
  api: [
    async ({ context, apiMode, signedIn }, provide) => {
      const api = createStubApi({ mode: apiMode, signedIn })
      await context.route(API_GLOB, (route) => api.handle(route))
      await provide(api)
    },
    { auto: true },
  ],
})

export { expect }

// The page must never scroll sideways on any screen size.
export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0)
}

export const isMobile = (testInfo) => testInfo.project.name === 'mobile'

// Opens the signed-in navigation: the links are in the bar on desktop and behind the menu button on mobile.
export async function openNav(page, testInfo) {
  if (isMobile(testInfo)) {
    await page.getByRole('button', { name: 'Open menu' }).click()
    return page.getByRole('navigation', { name: 'Mobile' })
  }
  return page.getByRole('navigation', { name: 'App' })
}
