import { TODAY } from './support/stubApi.js'
import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// Minimum Day in a real browser (Chromium, desktop and mobile), against the stubbed API (e2e/support/stubApi.js), which
// mirrors the server's rules for the label. The seeded day has four tasks: Read for twenty minutes, Gym session,
// Call the dentist (priority) and Morning walk. The real server is exercised in e2e-django/minimum-day.spec.js.

const panelOf = (page) => page.getByRole('region', { name: 'Minimum Day' })

async function choose(page, titles) {
  const panel = panelOf(page)
  await panel.getByRole('button', { name: /Choose your minimum|Change minimum/ }).click()
  for (const title of titles) await panel.getByRole('checkbox', { name: title }).check()
  await panel.getByRole('button', { name: 'Save minimum' }).click()
}

test.describe('Minimum Day', () => {
  test('is described, chosen, saved, and shown on the tasks; the day percentage is untouched', async ({ page, api }) => {
    await page.goto('/app/day')
    const panel = panelOf(page)
    await expect(panel).toContainText('Choose a few important tasks to keep your day moving.')
    await expect(page.getByText('0% of today’s plan')).toBeVisible()
    await choose(page, ['Read for twenty minutes', 'Morning walk'])
    await expect(panel.getByRole('list', { name: 'Your minimum tasks' })).toContainText('Read for twenty minutes')
    await expect(panel.getByRole('status')).toHaveText('Your minimum is still here whenever you’re ready.')
    expect(api.rows('task_occurrences').filter((o) => o.plan_date === TODAY && o.is_minimum).map((o) => o.title).sort()).toEqual(['Morning walk', 'Read for twenty minutes'])
    await expect(page.getByText('Minimum', { exact: true })).toHaveCount(2) // the label on each chosen task
    await expect(page.getByText('0% of today’s plan')).toBeVisible()
    expect(api.rows('task_occurrences').filter((o) => o.plan_date === TODAY && (o.completion > 0 || o.plan_state !== 'active'))).toHaveLength(0) // choosing changes nothing else
  })

  test('finishing the minimum shows the kind message while the full day stays where it is', async ({ page }) => {
    await page.goto('/app/day')
    await choose(page, ['Read for twenty minutes', 'Morning walk'])
    await page.getByRole('button', { name: 'Done: Read for twenty minutes', exact: true }).click()
    await expect(panelOf(page)).toContainText('1 of 2 done')
    await page.getByRole('button', { name: 'Done: Morning walk', exact: true }).click()
    await expect(panelOf(page).getByRole('status')).toHaveText('You showed up for yourself today.')
    await expect(page.getByText('50% of today’s plan')).toBeVisible() // two of four tasks: the minimum is not the whole day
    await expect(page.getByText('Done counts as 1')).toBeVisible()
  })

  test('stops at three, and survives a reload', async ({ page }) => {
    await page.goto('/app/day')
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'Choose your minimum' }).click()
    await panel.getByRole('checkbox', { name: 'Read for twenty minutes' }).check()
    await panel.getByRole('checkbox', { name: 'Gym session' }).check()
    await panel.getByRole('checkbox', { name: 'Call the dentist' }).check()
    await expect(panel.getByRole('checkbox', { name: 'Morning walk' })).toBeDisabled()
    await expect(panel.getByText('3 of 3 chosen')).toBeVisible()
    await panel.getByRole('button', { name: 'Save minimum' }).click()
    const chosen = panel.getByRole('list', { name: 'Your minimum tasks' }).getByRole('listitem')
    await expect(chosen).toHaveCount(3) // the save is one request per task: wait until it has finished before reloading
    await page.reload()
    await expect(chosen).toHaveCount(3)
  })

  test('works from the keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'keyboard path is the same markup; desktop covers it')
    await page.goto('/app/day')
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'Choose your minimum' }).focus()
    await page.keyboard.press('Enter')
    await panel.getByRole('checkbox', { name: 'Read for twenty minutes' }).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space')
    await expect(panel.getByText('2 of 3 chosen')).toBeVisible()
    await panel.getByRole('button', { name: 'Save minimum' }).focus()
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('list', { name: 'Your minimum tasks' })).toBeVisible()
  })

  test('a Busy day does not propose setting aside the minimum, and nothing is set aside by itself', async ({ page, api }) => {
    await page.goto('/app/day')
    await choose(page, ['Read for twenty minutes'])
    await page.getByRole('button', { name: 'Busy' }).click()
    const busy = page.getByRole('region', { name: 'Busy day' })
    await expect(busy.getByRole('listitem')).toHaveText(['Gym session', 'Morning walk']) // not the minimum, not the priority task
    expect(api.rows('task_occurrences').filter((o) => o.plan_state === 'excluded')).toHaveLength(0)
    await busy.getByRole('button', { name: 'Set these aside' }).click()
    await expect(page.getByRole('button', { name: 'Done: Read for twenty minutes', exact: true })).toBeVisible() // the minimum stays
    await expect(panelOf(page).getByRole('list', { name: 'Your minimum tasks' })).toContainText('Read for twenty minutes')
  })

  test('setting a chosen task aside takes it out of the minimum', async ({ page }) => {
    await page.goto('/app/day')
    await choose(page, ['Gym session'])
    await page.getByRole('button', { name: 'Set aside Gym session' }).click()
    await expect(panelOf(page)).toContainText('You haven’t chosen a minimum for this day. That is fine.')
  })

  test('clearing the minimum keeps every task', async ({ page, api }) => {
    await page.goto('/app/day')
    await choose(page, ['Morning walk'])
    await panelOf(page).getByRole('button', { name: 'Clear minimum' }).click()
    await expect(panelOf(page)).toContainText('You haven’t chosen a minimum for this day. That is fine.')
    expect(api.rows('task_occurrences').filter((o) => o.plan_date === TODAY && o.plan_state === 'active')).toHaveLength(4)
  })

  test('a failed save explains calmly and can be retried', async ({ page, api }) => {
    await page.goto('/app/day')
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'Choose your minimum' }).click()
    await panel.getByRole('checkbox', { name: 'Morning walk' }).check()
    api.setMode('error')
    await panel.getByRole('button', { name: 'Save minimum' }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    api.setMode('normal')
    await panel.getByRole('button', { name: 'Save minimum' }).click()
    await expect(panel.getByRole('list', { name: 'Your minimum tasks' })).toContainText('Morning walk')
  })

  test('another day has its own minimum and past history is a record', async ({ page }) => {
    await page.goto('/app/day')
    await choose(page, ['Morning walk'])
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Monday, 9 Mar' })).toBeVisible()
    await expect(panelOf(page).getByRole('list', { name: 'Your minimum tasks' })).toHaveCount(0)
  })

  test('fits the screen and every control is reachable', async ({ page }) => {
    await page.goto('/app/day')
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'Choose your minimum' }).click()
    await expectNoHorizontalScroll(page)
    const viewport = page.viewportSize()
    for (const control of [panel.getByRole('checkbox').first(), panel.getByRole('button', { name: 'Cancel' })]) {
      await control.scrollIntoViewIfNeeded()
      const box = await control.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
  })
})
