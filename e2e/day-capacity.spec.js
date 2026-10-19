import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// Priority levels and the time for the day, in a real browser (Chromium, desktop and phone width), against the stubbed API. The seeded
// day: Read (20 min), Call the dentist (15 min, high priority, made once), Gym session (60 min) and Morning walk (no length) repeat.
// That is 1 h 35 min planned, and Morning walk has no length, so the note says it is not counted. The pinned day is Tuesday 10 March, so tomorrow is Wednesday 11 March.
test.use({ timezoneId: 'America/New_York' })

const note = (page) => page.getByRole('region', { name: 'Day capacity', exact: true })
const available = (page) => page.getByLabel('Time you have for tasks')
async function setPriority(page, title, level) {
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click()
  const form = page.getByRole('form', { name: `Edit ${title}`, exact: true })
  await form.getByLabel('Priority').selectOption(level)
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form).toHaveCount(0)
}

test.describe('Priority levels and the time for the day', () => {
  test('shows the planned time against the time available, 6 hours until the person says otherwise', async ({ page }) => {
    await page.goto('/app/day')
    await expect(note(page)).toContainText('1 h 35 min planned of 6 h available (1 task has no time or estimate, so not counted).')
    await expect(note(page).getByRole('progressbar', { name: /Planned time: 26 percent/ })).toBeVisible()
    await expect(note(page)).not.toContainText('If you like')
    await expectNoHorizontalScroll(page)
  })

  test('a task has High, Medium and Low; Low shows as a chip, High as before', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Edit Morning walk', exact: true }).click()
    const form = page.getByRole('form', { name: 'Edit Morning walk', exact: true })
    await expect(form.getByLabel('Priority').locator('option')).toHaveText(['High', 'Medium', 'Low'])
    await expect(form.getByLabel('Priority')).toHaveValue('medium')
    await form.getByRole('button', { name: 'Cancel' }).click()
    await setPriority(page, 'Morning walk', 'low')
    await expect(page.getByText('Low priority')).toHaveCount(1)
    await expect(page.getByText(/Call the dentist \(priority\)/)).toBeVisible()
  })

  test('with less time than the day needs and nothing easy to move, it says so and offers no button', async ({ page }) => {
    await page.goto('/app/day')
    await available(page).selectOption('30')
    await expect(note(page)).toContainText('1 h 35 min planned of 30 min available: 1 h 5 min more than the time you have (1 task has no time or estimate, so not counted).')
    await expect(note(page)).toContainText('Nothing here is an easy one to move')
    await expect(page.getByRole('button', { name: /^Move \d/ })).toHaveCount(0)
  })

  test('suggests the lowest priority task that does not repeat, moves it only when asked, and the move can be undone', async ({ page }) => {
    await page.goto('/app/day')
    await setPriority(page, 'Call the dentist', 'low')
    await available(page).selectOption('30')
    await expect(note(page)).toContainText('If you like, you could move “Call the dentist” to Wednesday 11 Mar')
    await expect(page.getByRole('checkbox', { name: 'Done: Call the dentist', exact: true })).toBeVisible() // nothing moved yet
    await page.getByRole('button', { name: 'Move 1 to Wednesday 11 Mar' }).click()
    await expect(page.getByText('1 task moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Set aside tasks' })).toContainText('Moved to Wednesday 11 Mar')
    await page.getByRole('button', { name: 'Undo move of Call the dentist' }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Call the dentist', exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Set aside tasks' })).toHaveCount(0)
  })

  test('"Not now" hides the suggestion and the time available is remembered after a reload', async ({ page }) => {
    await page.goto('/app/day')
    await setPriority(page, 'Call the dentist', 'low')
    await available(page).selectOption('30')
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(note(page)).not.toContainText('If you like')
    await page.reload()
    await expect(available(page)).toHaveValue('30')
    await expect(note(page)).toContainText('of 30 min available')
  })

  test('works from the keyboard and fits the screen in the dark theme too', async ({ page }) => {
    await page.goto('/app/day')
    await available(page).focus()
    await page.keyboard.press('ArrowDown')
    await expect(available(page)).not.toHaveValue('360')
    await expectNoHorizontalScroll(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(note(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
