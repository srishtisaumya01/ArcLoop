import { TODAY } from './support/stubApi.js'
import { expect, expectNoHorizontalScroll, isMobile, openNav, test } from './support/fixtures.js'

// Real browser (Chromium), real app and dev server, stubbed API endpoints: see e2e/support/stubApi.js.

test.describe('sign-in', () => {
  test.use({ signedIn: false })

  test('a signed-out visitor is sent to log in, and logging in through the form opens the app', async ({ page, api }) => {
    await page.goto('/app/day')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
    await page.getByLabel('Email').fill('asha@example.com')
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong-password-1')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await page.getByRole('textbox', { name: 'Password' }).fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Log in' }).click()
    // Sent back to where they were going.
    await expect(page).toHaveURL(/\/app\/day$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tuesday, 10 Mar' })).toBeVisible()
    await expect(page.getByText('Morning walk')).toBeVisible()
    expect(api.writes()).toEqual([]) // looking at the day created nothing (it already existed)
  })
})

test.describe('My Day', () => {
  test('shows today, the welcome-back note after an untouched day, and dismisses it for good', async ({ page }) => {
    await page.goto('/app/day')
    const note = page.getByRole('region', { name: 'Welcome back' })
    await expect(note).toContainText('Welcome back.')
    await expect(note).toContainText("You don't have to make up for yesterday.")
    await expect(page.getByText('0% of today’s plan')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await note.getByRole('button', { name: 'Dismiss' }).click()
    await expect(note).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Morning walk')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Welcome back' })).toHaveCount(0)
  })

  test('completing and partly completing tasks updates progress, is saved, and survives a reload', async ({ page, api }) => {
    await page.goto('/app/day')
    await page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeChecked()
    await expect(page.getByText('25% of today’s plan')).toBeVisible()
    // Partly done is chosen in Edit, and shows as a dash on the row.
    await page.getByRole('button', { name: 'Edit Read for twenty minutes' }).click()
    const edit = page.getByRole('form', { name: 'Edit Read for twenty minutes' })
    await edit.getByRole('button', { name: 'Partly' }).click()
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Read for twenty minutes', exact: true })).toHaveAttribute('data-indeterminate', 'true')
    await expect(page.getByText('38% of today’s plan')).toBeVisible()
    await expect(page.getByText(/1 of 4 done, 1 partly done/)).toBeVisible()
    expect(api.find('task_occurrences', (o) => o.title === 'Morning walk' && o.plan_date === TODAY)).toMatchObject({ completion: 1 })
    expect(api.find('task_occurrences', (o) => o.title === 'Read for twenty minutes' && o.plan_date === TODAY)).toMatchObject({ completion: 0.5 })
    await expect(page.getByRole('region', { name: 'Welcome back' })).toHaveCount(0) // progress today ends the note
    await page.reload()
    await expect(page.getByText('38% of today’s plan')).toBeVisible()
  })

  test('editing a task saves its description, category and end time, and refuses an end before the start', async ({ page, api }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Edit Read for twenty minutes' }).click()
    const form = page.getByRole('form', { name: 'Edit Read for twenty minutes' })
    await form.getByLabel(/End time/).fill('07:00') // before the 07:30 start
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form.getByText('The end time needs to be after the start time.')).toBeVisible()
    expect(api.writes('task_occurrences')).toEqual([]) // nothing was sent
    await form.getByLabel(/End time/).fill('07:50')
    await form.getByLabel(/Category/).fill('Learning')
    await form.getByLabel(/Description/).fill('Paper book, not the phone.')
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Paper book, not the phone.')).toBeVisible()
    await expect(page.getByText('07:30 to 07:50 · 20 min · Learning · repeats')).toBeVisible()
    const saved = api.find('task_occurrences', (o) => o.title === 'Read for twenty minutes' && o.plan_date === TODAY)
    expect(saved).toMatchObject({ planned_end: '07:50', category: 'Learning', description: 'Paper book, not the phone.', is_customized: true })
    expect(api.find('task_templates', (t) => t.title === 'Read for twenty minutes')).toMatchObject({ planned_end: null, category: null }) // this day only
    await expectNoHorizontalScroll(page)
  })

  test('a Busy day offers to set aside the non-priority tasks; applying keeps the original plan visible', async ({ page, api }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Busy' }).click()
    const panel = page.getByRole('region', { name: 'Busy day' })
    await expect(panel).toContainText('Keep what matters today. The rest can wait.')
    await expect(panel.getByRole('listitem')).toHaveText(['Read for twenty minutes', 'Gym session', 'Morning walk'])
    expect(api.rows('task_occurrences').filter((o) => o.plan_state === 'excluded')).toHaveLength(0) // nothing yet
    await panel.getByRole('button', { name: 'Set these aside' }).click()
    await expect(page.getByLabel('Set aside tasks').getByText('Set aside for a busy day')).toHaveCount(3)
    await expect(page.getByText('0% of today’s plan')).toBeVisible() // only the priority task remains
    expect(api.rows('task_occurrences').filter((o) => o.plan_date === TODAY && o.plan_state === 'excluded')).toHaveLength(3)
    expect(api.find('task_occurrences', (o) => o.title === 'Call the dentist')).toMatchObject({ plan_state: 'active' })
    await page.getByRole('button', { name: 'Put back Morning walk' }).click()
    await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeVisible()
  })

  test('each task has one checkbox that is a comfortable tap target (at least 44 px, spec DP-06)', async ({ page }) => {
    await page.goto('/app/day')
    const boxes = page.getByRole('checkbox', { name: /^Done: / })
    await expect(boxes.first()).toBeVisible()
    for (const box of await boxes.all()) {
      const size = await box.evaluate((input) => input.closest('.MuiCheckbox-root').getBoundingClientRect().toJSON())
      expect(size.width).toBeGreaterThanOrEqual(44)
      expect(size.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByRole('button', { name: /^(Not done|Partly|Done)(:|$)/ })).toHaveCount(0) // no three-way buttons on the rows
  })

  test('adding a task shows the planner’s validation, then adds it', async ({ page, api }) => {
    await page.goto('/app/day')
    const add = page.getByRole('form', { name: 'Add a task' })
    await add.getByRole('button', { name: 'Add task' }).click()
    await expect(add.getByText('Give the task a title.')).toBeVisible()
    await add.getByLabel(/^Task/).fill('Water the plants')
    await add.getByLabel(/^Task/).press('Enter') // like a to-do list: Enter adds it
    await expect(page.getByRole('checkbox', { name: 'Done: Water the plants', exact: true })).toBeVisible()
    await expect(add.getByLabel(/^Task/)).toHaveValue('')
    expect(api.find('task_templates', (t) => t.title === 'Water the plants')).toMatchObject({ recurrence: 'once', category: null, starts_on: TODAY, ends_on: TODAY })
    // The details a quick add leaves out are set afterwards, in Edit.
    await page.getByRole('button', { name: 'Edit Water the plants' }).click()
    const edit = page.getByRole('form', { name: 'Edit Water the plants' })
    await edit.getByLabel(/Category/).fill('Home')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(/^Home/)).toBeVisible() // the row shows the category (a one-off task also says "repeats": an existing quirk, not part of this change)
    // Quick add has only a title: no time, estimate, category, description, priority or repeat fields.
    for (const label of [/Start time/, /Estimate/, /Category/, /Description/, 'Repeats']) await expect(add.getByLabel(label)).toHaveCount(0)
  })
})

test.describe('Week and Progress', () => {
  test('the week shows the note, the summary and a day’s plan, and links into My Day', async ({ page }) => {
    await page.goto('/app/week')
    await expect(page.getByText('This week')).toBeVisible()
    await expect(page.getByRole('region', { name: 'After missed days' })).toContainText('Every week is a fresh opportunity.')
    const summary = page.getByLabel('Week summary')
    await expect(summary.getByText('Days with a plan').locator('..')).toContainText('2')
    // Coming up counts the repeating tasks the unopened days will hold: two daily tasks on Wed..Sun plus the gym on Thursday.
    await expect(summary.getByText('Coming up').locator('..')).toContainText('11')
    await expect(summary.getByText('Coming up').locator('..')).toContainText('about 2 h 40 min estimated, 5 without an estimate')
    await expect(page.getByRole('button', { name: /Friday 13 Mar: Planned. 2 tasks planned/ })).toBeVisible()
    await page.getByRole('button', { name: /Monday 9 Mar/ }).click()
    const detail = page.getByLabel('Monday 9 Mar plan')
    await expect(detail).toContainText('Morning walk')
    await expect(detail).toContainText('Read for twenty minutes')
    await expectNoHorizontalScroll(page)
    await detail.getByRole('link', { name: 'Open in My Day' }).click()
    await expect(page).toHaveURL(/\/app\/day\?date=2026-03-09$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Monday, 9 Mar' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Welcome back' })).toHaveCount(0) // only on today
  })

  test('an earlier week can be reviewed and the current week returned to', async ({ page }) => {
    await page.goto('/app/week')
    await page.getByRole('button', { name: 'Previous week' }).click()
    await expect(page.getByRole('heading', { name: '2 Mar to 8 Mar 2026' })).toBeVisible()
    await expect(page.getByLabel('Week summary').getByText('Tasks completed').locator('..')).toContainText('7')
    await expect(page.getByRole('button', { name: /Sunday 8 Mar: Rest day/ })).toBeVisible()
    await page.getByRole('button', { name: 'Back to this week' }).click()
    await expect(page.getByText('This week')).toBeVisible()
  })

  test('progress lists recent weeks and each repeating task from the stored data', async ({ page }) => {
    await page.goto('/app/progress')
    const weeks = page.getByRole('region', { name: 'Recent weeks' })
    await expect(weeks.getByText('4 days with progress · 7 tasks done · 1 partly done · 1 rest day')).toBeVisible()
    const habits = page.getByRole('region', { name: 'Recurring tasks' })
    await expect(habits.getByRole('heading', { level: 3 })).toHaveText(['Gym session', 'Morning walk', 'Read for twenty minutes'])
    await expect(habits.getByText('2 of 6 planned days done, 1 partly done')).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})

test.describe('Recurring Tasks', () => {
  test('editing a repeating task’s description, category and end time updates untouched upcoming days only', async ({ page, api }) => {
    await page.goto('/app/recurring')
    const card = page.getByRole('heading', { name: 'Morning walk' }).locator('xpath=ancestor::li')
    await card.getByRole('button', { name: 'Edit Morning walk' }).click()
    const form = page.getByRole('form', { name: 'Edit Morning walk' })
    await form.getByLabel(/Start time/).fill('06:45')
    await form.getByLabel(/End time/).fill('07:15')
    await form.getByLabel(/Category/).fill('Health')
    await form.getByLabel(/Description/).fill('Round the park.')
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(card).toContainText('Saved. 1 upcoming day was updated.')
    await expect(card).toContainText('Every day · 06:45 to 07:15 · Health')
    await expect(card).toContainText('Round the park.')
    expect(api.find('task_templates', (t) => t.title === 'Morning walk')).toMatchObject({ planned_start: '06:45', planned_end: '07:15', category: 'Health', description: 'Round the park.' })
    expect(api.find('task_occurrences', (o) => o.title === 'Morning walk' && o.plan_date === TODAY)).toMatchObject({ planned_end: '07:15', category: 'Health' })
    expect(api.find('task_occurrences', (o) => o.title === 'Morning walk' && o.plan_date === '2026-03-09')).toMatchObject({ planned_end: null, category: null }) // history untouched
    await expectNoHorizontalScroll(page)
  })

  test('a repeating task’s start and end dates can be changed, with the planner’s validation', async ({ page, api }) => {
    await page.goto('/app/recurring')
    const card = page.getByRole('heading', { name: 'Gym session' }).locator('xpath=ancestor::li')
    await card.getByRole('button', { name: 'Edit Gym session' }).click()
    const form = page.getByRole('form', { name: 'Edit Gym session' })
    await form.getByLabel('Ends on (optional)').fill('2026-02-01')
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form.getByText('The end date cannot be before the start date.')).toBeVisible()
    expect(api.writes('task_templates')).toEqual([])
    await form.getByLabel('Ends on (optional)').fill('2026-03-26')
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(card).toContainText('Since 1 Mar, until 26 Mar')
    expect(api.find('task_templates', (t) => t.title === 'Gym session')).toMatchObject({ starts_on: '2026-03-01', ends_on: '2026-03-26' })
    expect(api.rows('task_occurrences').filter((o) => o.title === 'Gym session')).toHaveLength(2) // nothing deleted
  })

  test('ending a repeating task needs confirmation and keeps its records', async ({ page, api }) => {
    await page.goto('/app/recurring')
    await page.getByRole('button', { name: 'End Gym session' }).click()
    await page.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(api.find('task_templates', (t) => t.title === 'Gym session').archived_at).toBeNull()
    await page.getByRole('button', { name: 'End Gym session' }).click()
    await page.getByRole('button', { name: 'End this task' }).click()
    await expect(page.getByRole('region', { name: 'Ended' })).toContainText('Gym session')
    expect(api.find('task_templates', (t) => t.title === 'Gym session')).toMatchObject({ ends_on: TODAY })
    expect(api.rows('task_occurrences').filter((o) => o.title === 'Gym session')).toHaveLength(2) // 5 March and today stay
  })
})

test.describe('loading, empty and error states', () => {
  test.describe('error', () => {
    test.use({ apiMode: 'error' })
    test('a failed load shows a calm message with retry, and recovers', async ({ page, api }) => {
      await page.goto('/app/week')
      const alert = page.getByRole('alert')
      await expect(alert).toContainText('We couldn’t load this week')
      await expect(page.getByText(/stubbed failure/)).toHaveCount(0)
      api.setMode('normal')
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByText('This week')).toBeVisible()
    })
  })

  test.describe('empty', () => {
    test.use({ apiMode: 'empty' })
    test('a brand-new account sees empty states, not errors or zeros', async ({ page }) => {
      await page.goto('/app/progress')
      await expect(page.getByText('Nothing to show yet')).toBeVisible()
      await page.goto('/app/recurring')
      await expect(page.getByText('No recurring tasks yet')).toBeVisible()
      await page.goto('/app/week')
      await expect(page.getByText('Nothing planned this week')).toBeVisible()
      await expect(page.getByRole('region', { name: 'After missed days' })).toHaveCount(0) // no plan is never a missed day
    })
  })

  test.describe('loading', () => {
    test.use({ apiMode: 'slow' })
    test('a slow load shows a loading state first', async ({ page }) => {
      await page.goto('/app/day')
      await expect(page.getByLabel('Loading your day')).toBeVisible()
      await expect(page.getByText('Morning walk')).toBeVisible({ timeout: 15000 })
    })
  })
})

test('navigation lists the app links in the sidebar and marks the current page', async ({ page }, testInfo) => {
  await page.goto('/app/week')
  const nav = await openNav(page, testInfo)
  await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'My Day', 'Week', 'Progress', 'Recurring Tasks', 'Reminders', 'Settings'])
  await expect(nav.getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  if (!isMobile(testInfo)) await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  await expectNoHorizontalScroll(page)
})
