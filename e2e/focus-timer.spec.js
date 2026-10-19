import { NOW_ISO } from './support/stubApi.js'
import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// My Day's daily schedule and focus timer in a real browser (Chromium, desktop and phone width), against the stubbed API. The browser's
// clock is Playwright's controllable clock, so "twenty minutes" take no time: `runFor` moves the clock and fires the timers the page set.
// The seeded day: Read for twenty minutes (07:30), Call the dentist (09:00, priority), Gym session (18:00) and Morning walk (no time).
test.use({ timezoneId: 'America/New_York' }) // 11:00 at the pinned time, so Gym session is the next block

const timer = (page) => page.getByRole('timer', { name: 'Time left' })
const focusOn = (page, title) => page.getByRole('button', { name: `Focus on ${title}`, exact: true })
const begin = async (page, title, minutes) => {
  await focusOn(page, title).click()
  await page.getByRole('button', { name: `${minutes} minutes`, exact: true }).click()
  await page.getByRole('button', { name: 'Start focus' }).click()
  await expect(page.getByRole('heading', { name: `Focusing on “${title}”` })).toBeVisible()
}
const doneBoxes = (list) => list.getByRole('checkbox', { name: /^Done:/ })
const day = async (page) => {
  // Time stands still until the test moves it (runFor), so a countdown can be read exactly, also after a reload.
  await page.clock.install({ time: new Date(Date.parse(NOW_ISO) - 1000) })
  await page.clock.pauseAt(new Date(NOW_ISO))
  await page.goto('/app/day')
  await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeVisible()
}

test.describe('The daily schedule', () => {
  test('puts the tasks with a time in time order, apart from the ones with no time, and marks what is next', async ({ page }) => {
    await page.goto('/app/day')
    const scheduled = page.getByRole('list', { name: 'Scheduled tasks', exact: true })
    await expect(doneBoxes(scheduled)).toHaveCount(3)
    await expect(doneBoxes(scheduled).nth(0)).toHaveAccessibleName('Done: Read for twenty minutes')
    await expect(doneBoxes(scheduled).nth(1)).toHaveAccessibleName('Done: Call the dentist')
    await expect(doneBoxes(scheduled).nth(2)).toHaveAccessibleName('Done: Gym session')
    await expect(page.getByRole('list', { name: 'Unscheduled tasks', exact: true }).getByRole('checkbox', { name: 'Done: Morning walk' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Scheduled' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Anytime' })).toBeVisible()
    await expect(scheduled.getByText('Next up')).toHaveCount(1)
    await expect(scheduled.getByRole('listitem').filter({ hasText: 'Gym session' }).getByText('Next up')).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('giving a task a time with Edit moves it into the schedule, and taking it away moves it back', async ({ page }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Edit Morning walk' }).click()
    const form = page.getByRole('form', { name: 'Edit Morning walk' })
    await form.getByLabel(/Start time/).fill('12:15')
    await form.getByRole('button', { name: 'Save changes' }).click()
    const scheduled = page.getByRole('list', { name: 'Scheduled tasks', exact: true })
    await expect(scheduled.getByRole('checkbox', { name: 'Done: Morning walk' })).toBeVisible()
    await expect(doneBoxes(scheduled).nth(3)).toHaveAccessibleName('Done: Gym session') // 12:15 sits before 18:00
    await expect(page.getByRole('list', { name: 'Unscheduled tasks', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit Morning walk' }).click()
    await page.getByRole('form', { name: 'Edit Morning walk' }).getByLabel(/Start time/).fill('')
    await page.getByRole('form', { name: 'Edit Morning walk' }).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('list', { name: 'Unscheduled tasks', exact: true }).getByRole('checkbox', { name: 'Done: Morning walk' })).toBeVisible()
  })
})

test.describe('The focus timer', () => {
  test('counts down from the clock, does not count paused time, and finishes with a summary that leaves the task alone', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 25)
    await expect(timer(page)).toHaveText('25:00')
    await page.clock.runFor('05:00')
    await expect(timer(page)).toHaveText('20:00')
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByText('Paused. This time is not counted.')).toBeVisible()
    await page.clock.runFor('30:00') // half an hour paused
    await expect(timer(page)).toHaveText('20:00')
    await page.getByRole('button', { name: 'Resume' }).click()
    await page.clock.runFor('20:05')
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
    await expect(page.getByText('You focused for 25 minutes on “Morning walk”.')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).not.toBeChecked() // the timer did not finish the task
    await expect(page.getByRole('button', { name: 'Mark it done' })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByLabel('Focus time on this day')).toHaveText('Focus time on this day: 25 minutes in 1 session.')
    await expect(page.getByText(/25 min focused/)).toBeVisible()
  })

  test('survives a reload: a running session keeps its time, a paused one stays paused', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 15)
    await page.clock.runFor('05:00')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Focusing on “Morning walk”' })).toBeVisible()
    await expect(timer(page)).toHaveText('10:00')
    await page.clock.runFor('03:00')
    await expect(timer(page)).toHaveText('07:00')
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.reload()
    await expect(page.getByText('Paused. This time is not counted.')).toBeVisible()
    await expect(timer(page)).toHaveText('07:00')
    await page.getByRole('button', { name: 'Resume' }).click()
    await page.clock.runFor('07:05')
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  })

  test('ending early keeps the time focused and says it ended early', async ({ page }) => {
    await day(page)
    await begin(page, 'Read for twenty minutes', 45)
    await page.clock.runFor('12:00')
    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.getByRole('dialog', { name: 'End this focus session?' })).toContainText('12 minutes so far')
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
    await expect(page.getByRole('heading', { name: 'Session ended early' })).toBeVisible()
    await expect(page.getByText('You focused for 12 minutes on “Read for twenty minutes”. That still counts.')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Done: Read for twenty minutes', exact: true })).not.toBeChecked()
  })

  test('only one session at a time: the other tasks cannot start one while it runs', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 15)
    await expect(focusOn(page, 'Morning walk')).toBeDisabled()
    await expect(focusOn(page, 'Call the dentist')).toBeDisabled() // not a button that silently does nothing
    await expect(focusOn(page, 'Call the dentist')).toHaveAttribute('title', /already running/)
    await expect(page.getByRole('heading', { name: 'Focusing on “Morning walk”' })).toBeVisible() // still the first session
    await expect(page.getByRole('heading', { name: /^Focus on “/ })).toHaveCount(0)
  })

  // `fastForward` jumps the clock without running the seconds in between: what a computer going to sleep looks like to the page.
  const gapNotice = (page) => page.getByRole('alert').filter({ hasText: 'The timer wasn’t running' })

  test('a long silence (the computer asleep) is not counted until the person says so: “No” leaves it out', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 45)
    await page.clock.runFor('05:00')
    await expect(timer(page)).toHaveText('40:00')
    await page.clock.fastForward('30:00')
    await expect(gapNotice(page)).toContainText('about 30 minutes')
    await expect(timer(page)).toHaveText('40:00') // the clock stood still at what was seen
    await expect(page.getByRole('heading', { name: 'Session complete' })).toHaveCount(0)
    await page.getByRole('button', { name: 'No, don’t count it' }).click()
    await expect(gapNotice(page)).toHaveCount(0)
    await expect(timer(page)).toHaveText('40:00')
    await page.clock.runFor('01:00')
    await expect(timer(page)).toHaveText('39:00')
  })

  test('“Yes” counts the silence as focus', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 45)
    await page.clock.runFor('05:00')
    await page.clock.fastForward('30:00')
    await expect(gapNotice(page)).toBeVisible()
    await page.getByRole('button', { name: 'Yes, count that time' }).click()
    await expect(gapNotice(page)).toHaveCount(0)
    await expect(timer(page)).toHaveText('10:00') // 45 minutes planned, 35 passed
  })

  test('sleeping through the whole session does not quietly complete it', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 15)
    await page.clock.runFor('02:00')
    await page.clock.fastForward('01:00:00')
    await expect(gapNotice(page)).toContainText('about 60 minutes')
    await expect(page.getByRole('heading', { name: 'Session complete' })).toHaveCount(0)
    await expect(page.getByLabel('Focus time on this day')).toHaveCount(0) // nothing recorded
    await page.getByRole('button', { name: 'No, don’t count it' }).click()
    await expect(timer(page)).toHaveText('13:00')
  })

  test('the question is still there after a reload, and ending then keeps only the time that was seen', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 45)
    await page.clock.runFor('05:00')
    await page.clock.fastForward('30:00')
    await expect(gapNotice(page)).toBeVisible()
    await page.reload()
    await expect(gapNotice(page)).toContainText('about 30 minutes')
    await expect(timer(page)).toHaveText('40:00')
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
    await expect(page.getByText('You focused for 5 minutes on “Morning walk”. That still counts.')).toBeVisible()
  })

  test('works from the keyboard', async ({ page }) => {
    await day(page)
    await focusOn(page, 'Morning walk').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Focus on “Morning walk”' })).toBeFocused() // the pressed button is gone: focus follows to the panel
    await page.getByRole('button', { name: '45 minutes', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: '45 minutes', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Start focus' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Focusing on “Morning walk”' })).toBeFocused()
    await expect(timer(page)).toHaveText('45:00')
    await page.getByRole('button', { name: 'Pause' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  })

  test('the tree does not animate when the person asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await day(page)
    await begin(page, 'Morning walk', 15)
    const durations = await page.locator('.tree-part').evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration))
    expect(durations.length).toBeGreaterThan(0)
    expect(durations.every((d) => parseFloat(d) < 0.001)).toBe(true) // the app's reduced-motion rule makes every transition effectively instant
  })

  test('fits the screen while running, in the dark theme too', async ({ page }) => {
    await day(page)
    await begin(page, 'Morning walk', 25)
    await expectNoHorizontalScroll(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectNoHorizontalScroll(page)
    await expect(page.getByRole('img', { name: /Your tree is/ })).toBeVisible()
  })
})
