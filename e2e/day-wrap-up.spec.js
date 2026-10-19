import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// My Day's wrap-up in a real browser (Chromium, desktop and phone width), against the stubbed API. The seeded day: Read for twenty minutes,
// Gym session and Morning walk are repeating tasks; Call the dentist is a one-off. The pinned day is Tuesday 10 March, so tomorrow is Wednesday 11 March.
test.use({ timezoneId: 'America/New_York' })

const wrapUp = (page) => page.getByRole('region', { name: 'Wrap up the day', exact: true })
const lookBack = (page) => page.getByRole('button', { name: 'Look back on the day' })
const carryTo = (page, n) => page.getByRole('button', { name: `Carry ${n} to Wednesday 11 Mar` })

test.describe('Wrap up the day', () => {
  test('opens on request and shows the day: nothing done yet is fine, no focus recorded, and which tasks repeat anyway', async ({ page }) => {
    await page.goto('/app/day')
    await expect(wrapUp(page)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Done today' })).toHaveCount(0) // closed until asked for
    await lookBack(page).click()
    await expect(page.getByText('Nothing is ticked off yet. That is fine.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Focus time today' })).toHaveText(/No focus sessions were recorded in this browser today/)
    await expect(page.getByRole('region', { name: 'Still open' })).toContainText('Still open (4)')
    await expect(page.getByRole('checkbox', { name: 'Call the dentist', exact: true })).toBeChecked() // the one-off task, ticked to carry
    await expect(page.getByRole('checkbox', { name: 'Gym session', exact: true })).toHaveCount(0) // repeating tasks are not offered
    await expect(page.getByText(/These repeat anyway, so they will be on their own days: .*Gym session/)).toBeVisible()
    await expect(page.getByText('A task that did not happen today is just a task.')).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('carries the one-off task to tomorrow, says so, and the move can be undone', async ({ page }) => {
    await page.goto('/app/day')
    await lookBack(page).click()
    await carryTo(page, 1).click()
    await expect(page.getByText('1 task moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.')).toBeVisible()
    const aside = page.getByRole('list', { name: 'Set aside tasks' })
    await expect(aside).toContainText('Moved to Wednesday 11 Mar')
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Call the dentist', exact: true })).toBeVisible() // it is on tomorrow's list
    await page.getByRole('button', { name: 'Back to today' }).click()
    await page.getByRole('button', { name: 'Undo move of Call the dentist' }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Call the dentist', exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Set aside tasks' })).toHaveCount(0)
  })

  test('unticking a task keeps it on today', async ({ page }) => {
    await page.goto('/app/day')
    await lookBack(page).click()
    await page.getByRole('checkbox', { name: 'Call the dentist', exact: true }).uncheck()
    await expect(page.getByRole('button', { name: 'Choose what to carry' })).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: 'Done: Call the dentist', exact: true })).toBeVisible()
  })

  test('shows what was done once something is ticked off', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeChecked()
    await lookBack(page).click()
    await expect(page.getByRole('region', { name: 'Done today' })).toContainText('Done today (1)')
    await expect(page.getByRole('region', { name: 'Done today' })).toContainText('Morning walk')
  })

  test('is offered on today only', async ({ page }) => {
    await page.goto('/app/day')
    await expect(wrapUp(page)).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByRole('button', { name: 'Back to today' })).toBeVisible()
    await expect(wrapUp(page)).toHaveCount(0)
  })

  test('works from the keyboard', async ({ page }) => {
    await page.goto('/app/day')
    await lookBack(page).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Hide the wrap-up' })).toHaveAttribute('aria-expanded', 'true')
    const box = page.getByRole('checkbox', { name: 'Call the dentist', exact: true })
    await box.focus()
    await page.keyboard.press('Space')
    await expect(box).not.toBeChecked()
    await page.keyboard.press('Space')
    await expect(box).toBeChecked()
    await carryTo(page, 1).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^1 task moved to Wednesday 11 Mar\./)).toBeVisible()
  })

  test('fits the screen with the wrap-up open, in the dark theme too', async ({ page }) => {
    await page.goto('/app/day')
    await lookBack(page).click()
    await expect(page.getByRole('region', { name: 'Still open' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectNoHorizontalScroll(page)
  })
})
