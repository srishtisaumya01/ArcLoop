import { TODAY } from './support/stubApi.js'
import { expect, test } from './support/fixtures.js'

// Undo in a real browser (Chromium, desktop and phone width), against the stubbed API (e2e/support/stubApi.js): finishing a task and
// Undo, a failed Undo, keyboard use, moving a task and Undo. The browser clock is pinned to Tuesday 10 March 2026. The seeded day:
// Read for twenty minutes, Gym session, Call the dentist (a one-off) and Morning walk. The real server is in e2e-django/undo.spec.js.
// The 8-second timing and its pause on hover and focus are tested deterministically with fake timers in tests/unit/undoNotice.test.jsx.

const tick = (page, title) => page.getByRole('checkbox', { name: `Done: ${title}`, exact: true })
const done = (title) => `“${title}” marked done.`
const undoOf = (page, title) => page.getByRole('button', { name: `Undo: ${title} marked done` })
const completionOf = (api, title) => api.find('task_occurrences', (o) => o.title === title && o.plan_date === TODAY).completion

// Makes every change request fail (a dropped connection) until the returned function is called.
async function dropWrites(page) {
  const handler = (route) => (route.request().method() === 'PATCH' ? route.abort() : route.fallback())
  await page.route('**/api/v1/task-occurrences/**', handler)
  return () => page.unroute('**/api/v1/task-occurrences/**', handler)
}

test.describe('Undo after finishing a task', () => {
  test('offers Undo, and Undo puts the task back as the server holds it', async ({ page, api }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').click()
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    await expect(tick(page, 'Morning walk')).toBeChecked()
    expect(completionOf(api, 'Morning walk')).toBe(1)
    await undoOf(page, 'Morning walk').click()
    await expect(page.getByText(done('Morning walk'))).toBeHidden()
    await expect(tick(page, 'Morning walk')).not.toBeChecked()
    expect(completionOf(api, 'Morning walk')).toBe(0)
    await expect(page.getByText('0% of today’s plan')).toBeVisible()
  })

  test('puts a partly done task back to partly done', async ({ page, api }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Edit Morning walk' }).click()
    const edit = page.getByRole('form', { name: 'Edit Morning walk' })
    await edit.getByRole('button', { name: 'Partly' }).click()
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(tick(page, 'Morning walk')).toHaveAttribute('data-indeterminate', 'true')
    await tick(page, 'Morning walk').click() // one tick finishes it
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    await undoOf(page, 'Morning walk').click()
    await expect(tick(page, 'Morning walk')).toHaveAttribute('data-indeterminate', 'true')
    expect(completionOf(api, 'Morning walk')).toBe(0.5)
  })

  test('with two tasks ticked in a row the notice is for the latest, and Undo leaves the earlier one done', async ({ page, api }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').click()
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    await tick(page, 'Read for twenty minutes').click()
    await expect(page.getByText(done('Read for twenty minutes'))).toBeVisible()
    await expect(page.getByText(done('Morning walk'))).toBeHidden()
    await expect(page.getByRole('button', { name: /^Undo:/ })).toHaveCount(1)
    await undoOf(page, 'Read for twenty minutes').click()
    await expect(tick(page, 'Read for twenty minutes')).not.toBeChecked()
    await expect(tick(page, 'Morning walk')).toBeChecked()
    expect(completionOf(api, 'Morning walk')).toBe(1)
  })

  test('a failed Undo says so, shows no false success, and Try again works', async ({ page, api }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').click()
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    const restore = await dropWrites(page)
    await undoOf(page, 'Morning walk').click()
    await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toBeVisible()
    await expect(page.getByText(done('Morning walk'))).toBeHidden() // the notice shows the problem, not the old message
    await expect(tick(page, 'Morning walk')).toBeChecked() // still done, because the server never changed it
    expect(completionOf(api, 'Morning walk')).toBe(1)
    await restore()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(tick(page, 'Morning walk')).not.toBeChecked()
    expect(completionOf(api, 'Morning walk')).toBe(0)
  })

  test('if the task changed somewhere else, Undo says so and overwrites nothing', async ({ page, api }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').click()
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    api.find('task_occurrences', (o) => o.title === 'Morning walk' && o.plan_date === TODAY).completion = 0.5 // another tab
    await undoOf(page, 'Morning walk').click()
    await expect(page.getByText('That task changed since. Reload to see where it is now.')).toBeVisible()
    await expect(page.getByText(done('Morning walk'))).toBeHidden()
    await expect(tick(page, 'Morning walk')).toHaveAttribute('data-indeterminate', 'true') // the screen shows where it is now
    expect(completionOf(api, 'Morning walk')).toBe(0.5)
  })

  test('works from the keyboard: Undo is focusable, Enter undoes, Escape closes the notice', async ({ page, api }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').focus()
    await page.keyboard.press('Space')
    await expect(page.getByText(done('Morning walk'))).toBeVisible()
    await undoOf(page, 'Morning walk').focus()
    await expect(undoOf(page, 'Morning walk')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(tick(page, 'Morning walk')).not.toBeChecked()
    expect(completionOf(api, 'Morning walk')).toBe(0)
    await tick(page, 'Read for twenty minutes').click()
    await expect(page.getByText(done('Read for twenty minutes'))).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText(done('Read for twenty minutes'))).toBeHidden()
    await expect(tick(page, 'Read for twenty minutes')).toBeChecked() // closing the notice does not undo anything
  })

  test('the notice fits the screen and its button is a usable size', async ({ page }) => {
    await page.goto('/app/day')
    await tick(page, 'Morning walk').click()
    const undo = undoOf(page, 'Morning walk')
    await expect(undo).toBeVisible()
    const box = await undo.boundingBox()
    const viewport = page.viewportSize()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
    expect(box.height).toBeGreaterThanOrEqual(30)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
})

test.describe('Move and its Undo', () => {
  async function moveDentist(page, date) {
    await page.getByRole('button', { name: 'Move Call the dentist', exact: true }).click()
    const form = page.getByRole('form', { name: 'Move Call the dentist' })
    await form.getByLabel('Move to').fill(date)
    await form.getByRole('button', { name: 'Move task', exact: true }).click()
  }

  test('the date field offers only days the planner accepts', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Move Call the dentist', exact: true }).click()
    const date = page.getByRole('form', { name: 'Move Call the dentist' }).getByLabel('Move to')
    await expect(date).toHaveAttribute('min', '2026-03-04')
    await expect(date).toHaveAttribute('max', '2026-04-09')
    await expect(date).toHaveValue('2026-03-11')
  })

  test('moving a one-off task offers Undo, and Undo brings it back without leaving a copy', async ({ page, api }) => {
    await page.goto('/app/day')
    await moveDentist(page, '2026-03-12')
    await expect(page.getByText('“Call the dentist” moved to Thursday 12 Mar.')).toBeVisible()
    await expect(page.getByLabel('Set aside tasks').getByText('Moved to Thursday 12 Mar')).toBeVisible()
    await page.getByRole('button', { name: 'Undo: move of Call the dentist' }).click()
    await expect(page.getByText('“Call the dentist” moved to Thursday 12 Mar.')).toBeHidden()
    await expect(tick(page, 'Call the dentist')).toBeVisible()
    await expect(page.getByLabel('Set aside tasks')).toHaveCount(0)
    expect(api.rows('task_occurrences').filter((o) => o.title === 'Call the dentist')).toHaveLength(1) // no duplicate, no hidden copy
    expect(api.find('task_occurrences', (o) => o.title === 'Call the dentist')).toMatchObject({ plan_date: TODAY, plan_state: 'active' })
  })

  test('a failed Undo of a move says so and Try again works', async ({ page, api }) => {
    await page.goto('/app/day')
    await moveDentist(page, '2026-03-12')
    await expect(page.getByText('“Call the dentist” moved to Thursday 12 Mar.')).toBeVisible()
    const restore = await dropWrites(page)
    await page.getByRole('button', { name: 'Undo: move of Call the dentist' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toBeVisible()
    expect(api.find('task_occurrences', (o) => o.title === 'Call the dentist' && o.plan_date === TODAY)).toMatchObject({ plan_state: 'excluded', excluded_reason: 'rescheduled' })
    await restore()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(tick(page, 'Call the dentist')).toBeVisible()
    expect(api.find('task_occurrences', (o) => o.title === 'Call the dentist')).toMatchObject({ plan_date: TODAY, plan_state: 'active' })
  })

  test('a repeating task that is due on the new day anyway is moved without the quick Undo', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Move Morning walk', exact: true }).click() // a daily task
    const form = page.getByRole('form', { name: 'Move Morning walk' })
    await form.getByLabel('Move to').fill('2026-03-12')
    await form.getByRole('button', { name: 'Move task', exact: true }).click()
    await expect(page.getByLabel('Set aside tasks').getByText('Moved to Thursday 12 Mar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo: move of Morning walk' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo move of Morning walk' })).toBeVisible() // the row's own button is still there
  })
})
