import { expect, expectNoHorizontalScroll, isMobile, test } from './support/fixtures.js'

// The phone tab bar in a real browser (Chromium): shown on the phone and hidden on the desktop, on the public site and in the signed-in
// app, with working taps, the current page marked, the dark theme and Hindi, and nothing hidden behind it.
const bar = (page) => page.getByRole('navigation', { name: 'Quick navigation' })
const tab = (page, name) => bar(page).getByRole('link', { name, exact: true })
const rect = (locator) => locator.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })

test.describe('on the public site', () => {
  test.use({ signedIn: false })

  test('a phone gets Home, How to join, Challenges and Log in at the bottom; a desktop does not', async ({ page }, testInfo) => {
    await page.goto('/')
    if (!isMobile(testInfo)) {
      await expect(bar(page)).toBeHidden()
      return
    }
    await expect(bar(page)).toBeVisible()
    await expect(bar(page).getByRole('link')).toHaveText(['Home', 'How to join', 'Challenges', 'Log in'])
    await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page')
    const box = await bar(page).boundingBox()
    expect(Math.round(box.y + box.height)).toBe(844) // fixed to the bottom edge of the screen
    for (const name of ['Home', 'How to join', 'Challenges', 'Log in']) expect((await tab(page, name).boundingBox()).height).toBeGreaterThanOrEqual(48)
    await expectNoHorizontalScroll(page)
  })

  test('tapping a tab goes there and marks it as the current page', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/')
    await tab(page, 'Challenges').tap()
    await expect(page).toHaveURL(/\/challenges$/)
    await expect(tab(page, 'Challenges')).toHaveAttribute('aria-current', 'page')
    await expect(tab(page, 'Home')).not.toHaveAttribute('aria-current', 'page')
    await tab(page, 'How to join').tap()
    await expect(page).toHaveURL(/\/how-it-works$/)
    await tab(page, 'Log in').tap()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
    await tab(page, 'Home').tap()
    await expect(page).toHaveURL(/\/$/)
  })

  test('the end of the page is not hidden behind the bar', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/challenges')
    const footer = page.getByRole('contentinfo')
    await footer.scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 100000) // all the way down, whatever scrolls
    await expect.poll(async () => (await rect(footer)).bottom).toBeLessThanOrEqual((await rect(bar(page))).top + 1) // the footer ends above the bar
  })

  test('works in the dark theme and in Hindi', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click()
    await page.keyboard.press('Escape')
    const hindiBar = page.getByRole('navigation', { name: 'त्वरित नेविगेशन' }) // the landmark's name is translated too
    await expect(hindiBar).toBeVisible()
    await expect(hindiBar.getByRole('link')).toHaveText(['होम', 'कैसे जुड़ें', 'चैलेंज', 'लॉग इन'])
    await expectNoHorizontalScroll(page)
  })
})

test.describe('in the signed-in app', () => {
  test('a phone gets Home, My Day, Week, Challenges and Profile; a desktop keeps its sidebar and has no bar', async ({ page }, testInfo) => {
    await page.goto('/app')
    if (!isMobile(testInfo)) {
      await expect(bar(page)).toBeHidden()
      await expect(page.getByRole('navigation', { name: 'App' })).toBeVisible()
      return
    }
    await expect(bar(page)).toBeVisible()
    await expect(bar(page).getByRole('link')).toHaveText(['Home', 'My Day', 'Week', 'Challenges', 'Profile'])
    await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page')
    await expectNoHorizontalScroll(page)
  })

  test('tapping a tab opens that screen and marks it', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/app')
    await tab(page, 'My Day').tap()
    await expect(page).toHaveURL(/\/app\/day$/)
    await expect(tab(page, 'My Day')).toHaveAttribute('aria-current', 'page')
    await expect(tab(page, 'Home')).not.toHaveAttribute('aria-current', 'page')
    await tab(page, 'Week').tap()
    await expect(page).toHaveURL(/\/app\/week$/)
    await tab(page, 'Challenges').tap()
    await expect(page).toHaveURL(/\/app\/challenges$/)
    await tab(page, 'Profile').tap()
    await expect(page).toHaveURL(/\/app\/profile$/)
    await expect(tab(page, 'Profile')).toHaveAttribute('aria-current', 'page')
    await tab(page, 'Home').tap()
    await expect(page).toHaveURL(/\/app$/)
  })

  test('the menu still holds the rest of the app', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/app')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('navigation', { name: 'Mobile' })
    for (const name of ['Progress', 'Mark Attendance', 'Recurring Tasks', 'Reminders', 'Settings']) await expect(menu.getByRole('link', { name })).toBeVisible()
  })

  test('the last control on My Day can be reached and tapped, and the timezone suggestion sits above the bar', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    await page.goto('/app/day')
    const prompt = page.getByRole('region', { name: 'Timezone suggestion' })
    if (await prompt.isVisible()) expect((await rect(prompt)).bottom).toBeLessThanOrEqual((await rect(bar(page))).top)
    const add = page.getByRole('form', { name: 'Add a task' })
    await add.getByLabel(/^Task/).fill('Reachable above the bar')
    await add.getByRole('button', { name: 'Add task' }).tap() // a tap that would land on the bar or the suggestion is refused by the browser
    await expect(page.getByRole('checkbox', { name: 'Done: Reachable above the bar', exact: true })).toBeVisible()
  })
})

// The timezone suggestion is fixed above the bar on a phone. It shows when the account is on UTC and the device is somewhere else.
test.describe('with the timezone suggestion showing', () => {
  test.use({ timezoneId: 'Asia/Kolkata' })

  test('the suggestion sits above the bar, its choices can be tapped, and keyboard focus is never left underneath either', async ({ page, api }, testInfo) => {
    test.skip(!isMobile(testInfo), 'the bar is for phones')
    api.rows('profiles')[0].timezone = 'UTC'
    await page.goto('/app/day')
    const prompt = page.getByRole('region', { name: 'Timezone suggestion' })
    await expect(prompt).toBeVisible()
    expect((await rect(prompt)).bottom).toBeLessThanOrEqual((await rect(bar(page))).top)
    for (const target of [prompt.getByRole('button', { name: /^Use / }), prompt.getByRole('link', { name: 'Choose another' }), prompt.getByRole('button', { name: 'Not now' })]) {
      expect(await target.evaluate((e) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })).toBe(true)
    }
    // Tab through the screen: whatever takes focus is on top at its centre, not under the suggestion or the bar.
    await page.mouse.click(1, 1)
    const covered = []
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const hidden = await page.evaluate(() => {
        const e = document.activeElement
        if (!e || e === document.body) return null
        const r = e.getBoundingClientRect()
        if (r.bottom <= 0 || r.top >= innerHeight) return null
        const top = document.elementFromPoint(Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1))
        return e.contains(top) || (top && top.contains(e)) ? null : (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30)
      })
      if (hidden) covered.push(hidden)
    }
    expect(covered).toEqual([])
    await prompt.getByRole('button', { name: 'Not now' }).tap()
    await expect(prompt).toBeHidden()
  })
})
