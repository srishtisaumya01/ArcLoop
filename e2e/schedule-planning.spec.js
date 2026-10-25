import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// My Day's quick time control and schedule check in a real browser (Chromium, desktop and phone width), against the stubbed API. The seeded
// day: Read for twenty minutes (07:30, 20 min), Call the dentist (09:00, 15 min, priority), Gym session (18:00, 1 h) and Morning walk (no time).
test.use({ timezoneId: 'America/New_York' }) // 11:00 at the pinned time

const scheduled = (page) => page.getByRole('list', { name: 'Scheduled tasks', exact: true })
const unscheduled = (page) => page.getByRole('list', { name: 'Unscheduled tasks', exact: true })
const doneBoxes = (list) => list.getByRole('checkbox', { name: /^Done:/ })
const note = (page) => page.getByRole('region', { name: 'Schedule check' })
const control = (page, title) => page.getByRole('form', { name: `Time for ${title}` })

test.describe('Quick times and the schedule check', () => {
  test('a time is given with the device’s own picker, and a task that now overlaps another is pointed out, not changed', async ({ page }) => {
    await page.goto('/app/day')
    await expect(note(page)).toHaveCount(0) // the seeded day fits
    await page.getByRole('button', { name: 'Set a time for Morning walk' }).click()
    await control(page, 'Morning walk').getByLabel('Start time').fill('09:05') // inside the dentist's 09:00 to 09:15
    await control(page, 'Morning walk').getByRole('button', { name: 'Save time' }).click()
    await expect(page.getByText('“Morning walk” is now at 09:05.')).toBeVisible()
    await expect(doneBoxes(scheduled(page)).nth(2)).toHaveAccessibleName('Done: Morning walk') // Read 07:30, dentist 09:00, walk 09:05, gym 18:00
    await expect(note(page)).toContainText('“Call the dentist” (09:00 to 09:15) overlaps “Morning walk” (09:05).')
    await expect(note(page)).toContainText('Nothing has changed.')
    await expect(unscheduled(page)).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })

  test('the 15 minute buttons clear the overlap without typing, and the note goes', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Set a time for Morning walk' }).click()
    await control(page, 'Morning walk').getByLabel('Start time').fill('09:05')
    await control(page, 'Morning walk').getByRole('button', { name: 'Save time' }).click()
    await expect(note(page)).toBeVisible()
    await page.getByRole('button', { name: 'Change the time of Morning walk' }).click()
    await page.getByRole('button', { name: 'Move Morning walk 15 minutes later' }).click() // 09:20, after the dentist's 09:15
    await expect(page.getByText('“Morning walk” is now at 09:20.')).toBeVisible()
    await expect(note(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Move Morning walk 15 minutes earlier' }).click() // 09:05 again
    await expect(note(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('“Not now” hides the note for the day', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Set a time for Morning walk' }).click()
    await control(page, 'Morning walk').getByLabel('Start time').fill('09:05')
    await control(page, 'Morning walk').getByRole('button', { name: 'Save time' }).click()
    await expect(note(page)).toBeVisible()
    await note(page).getByRole('button', { name: 'Not now' }).click()
    await expect(note(page)).toHaveCount(0)
  })

  test('removing a time moves the task back to the ones with no time', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Change the time of Gym session' }).click()
    await control(page, 'Gym session').getByRole('button', { name: 'Remove the time' }).click()
    await expect(unscheduled(page).getByRole('checkbox', { name: 'Done: Gym session' })).toBeVisible()
    await expect(page.getByText('“Gym session” no longer has a time.')).toBeVisible()
  })

  test('shows the planner’s message when the end is before the start, and keeps the control open', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Set a time for Morning walk' }).click()
    await control(page, 'Morning walk').getByLabel('Start time').fill('10:00')
    await control(page, 'Morning walk').getByLabel('End time (optional)').fill('09:00')
    await control(page, 'Morning walk').getByRole('button', { name: 'Save time' }).click()
    await expect(control(page, 'Morning walk').getByRole('alert')).toHaveText('The end time needs to be after the start time.')
    await expect(unscheduled(page).getByRole('checkbox', { name: 'Done: Morning walk' })).toBeVisible() // nothing was saved
  })

  test('works from the keyboard', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Change the time of Gym session' }).focus()
    await page.keyboard.press('Enter')
    await expect(control(page, 'Gym session')).toBeVisible()
    await page.getByRole('button', { name: 'Move Gym session 15 minutes later' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('“Gym session” is now at 18:15.')).toBeVisible()
  })

  test('fits the screen with the control open, in the dark theme too', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Change the time of Gym session' }).click()
    await expect(control(page, 'Gym session')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectNoHorizontalScroll(page)
  })
})
