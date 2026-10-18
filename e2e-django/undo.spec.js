import { expect, test } from '@playwright/test'
import { apiAs, seedTasks, signUpViaForm, uniqueEmail } from './support/helpers.js'

// Undo through the real UI, the real Django API and a real SQLite file (desktop and phone width): finishing a task and Undo, a failed
// Undo, a task that changed elsewhere, the keyboard, and moving a task and Undo for one-off and repeating tasks. The 8-second timing
// and its pause on hover and focus are tested with fake timers in tests/unit/undoNotice.test.jsx.

const tick = (page, title) => page.getByRole('checkbox', { name: `Done: ${title}`, exact: true })
const done = (title) => `“${title}” marked done.`
const undoOf = (page, title) => page.getByRole('button', { name: `Undo: ${title} marked done` })
const rows = async (context) => (await apiAs(context).get('/task-occurrences/')).body.results
const rowOf = async (context, title) => (await rows(context)).find((o) => o.title === title)
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const isoWeekday = (date) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

async function dropWrites(page) {
  const handler = (route) => (route.request().method() === 'PATCH' ? route.abort() : route.fallback())
  await page.route('**/api/v1/task-occurrences/**', handler)
  return () => page.unroute('**/api/v1/task-occurrences/**', handler)
}

test('finishing a task offers Undo; Undo puts it back and the server agrees, also after a reload', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('undo'))
  await seedTasks(page, context, ['Walk', 'Read'])
  await tick(page, 'Walk').click()
  await expect(page.getByText(done('Walk'))).toBeVisible()
  expect((await rowOf(context, 'Walk')).completion).toBe(1)
  await undoOf(page, 'Walk').click()
  await expect(tick(page, 'Walk')).not.toBeChecked()
  await expect(page.getByText(done('Walk'))).toBeHidden()
  expect(await rowOf(context, 'Walk')).toMatchObject({ completion: 0, completed_at: null })
  await page.reload()
  await expect(tick(page, 'Walk')).not.toBeChecked()
})

test('Undo restores a partly done task to partly done', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('undopart'))
  await seedTasks(page, context, ['Walk'])
  const walk = await rowOf(context, 'Walk')
  expect((await apiAs(context).patch(`/task-occurrences/?id=${walk.id}`, { completion: 0.5 })).status).toBe(200)
  await page.reload()
  await expect(tick(page, 'Walk')).toHaveAttribute('data-indeterminate', 'true')
  await tick(page, 'Walk').click()
  await expect(page.getByText(done('Walk'))).toBeVisible()
  await undoOf(page, 'Walk').click()
  await expect(tick(page, 'Walk')).toHaveAttribute('data-indeterminate', 'true')
  expect((await rowOf(context, 'Walk')).completion).toBe(0.5)
})

test('a failed Undo says so, leaves the server as it was, and Try again works', async ({ page, context }) => {
  test.slow() // sign-up, a failed and a repeated request: long on a busy machine
  await signUpViaForm(page, uniqueEmail('undofail'))
  await seedTasks(page, context, ['Walk'])
  await tick(page, 'Walk').click()
  await expect(page.getByText(done('Walk'))).toBeVisible()
  const restore = await dropWrites(page)
  await undoOf(page, 'Walk').click()
  await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toBeVisible()
  await expect(tick(page, 'Walk')).toBeChecked()
  expect((await rowOf(context, 'Walk')).completion).toBe(1)
  await restore()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(tick(page, 'Walk')).not.toBeChecked()
  expect((await rowOf(context, 'Walk')).completion).toBe(0)
})

test('if the task changed somewhere else, the server refuses the stale Undo and the other change stands', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('undostale'))
  await seedTasks(page, context, ['Walk'])
  await tick(page, 'Walk').click()
  await expect(page.getByText(done('Walk'))).toBeVisible()
  const walk = await rowOf(context, 'Walk')
  expect((await apiAs(context).patch(`/task-occurrences/?id=${walk.id}`, { completion: 0.5 })).status).toBe(200) // another tab
  await undoOf(page, 'Walk').click()
  await expect(page.getByText('That task changed since. Reload to see where it is now.')).toBeVisible()
  await expect(tick(page, 'Walk')).toHaveAttribute('data-indeterminate', 'true')
  expect((await rowOf(context, 'Walk')).completion).toBe(0.5)
  // And at the API itself: the conditional update the Undo relies on applies to nothing once the state differs.
  const stale = await apiAs(context).patch(`/task-occurrences/?id=${walk.id}&completion=1`, { completion: 0 })
  expect([stale.status, stale.body]).toEqual([200, { results: [] }])
  expect((await rowOf(context, 'Walk')).completion).toBe(0.5)
})

test('works from the keyboard: focus Undo, press Enter', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('undokey'))
  await seedTasks(page, context, ['Walk'])
  await tick(page, 'Walk').focus()
  await page.keyboard.press('Space')
  await expect(page.getByText(done('Walk'))).toBeVisible()
  await undoOf(page, 'Walk').focus()
  await expect(undoOf(page, 'Walk')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tick(page, 'Walk')).not.toBeChecked()
  expect((await rowOf(context, 'Walk')).completion).toBe(0)
})

test('moving a one-off task: the date field is limited to the planner’s range, Undo brings the task back, and nothing is duplicated', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('undomove'))
  await seedTasks(page, context, ['Dentist'])
  const planDate = (await rowOf(context, 'Dentist')).plan_date
  await page.getByRole('button', { name: 'Move Dentist', exact: true }).click()
  const form = page.getByRole('form', { name: 'Move Dentist' })
  const field = form.getByLabel('Move to')
  await expect(field).toHaveAttribute('min', addDays(planDate, -6))
  await expect(field).toHaveAttribute('max', addDays(planDate, 30))
  await field.fill(addDays(planDate, 2))
  await form.getByRole('button', { name: 'Move task' }).click()
  await expect(page.getByText(/“Dentist” moved to .+\./)).toBeVisible()
  await expect(page.getByLabel('Set aside tasks')).toBeVisible()
  await page.getByRole('button', { name: 'Undo: move of Dentist' }).click()
  await expect(tick(page, 'Dentist')).toBeVisible()
  await expect(page.getByLabel('Set aside tasks')).toHaveCount(0)
  const after = (await rows(context)).filter((o) => o.title === 'Dentist')
  expect(after).toHaveLength(1)
  expect(after[0]).toMatchObject({ plan_date: planDate, plan_state: 'active' })
})

test('a repeating task: moved to a day it is not due it gets a clean Undo and its schedule is untouched; moved to a day it is due there is no quick Undo', async ({ page, context }) => {
  test.slow() // two repeating tasks and two moves
  await signUpViaForm(page, uniqueEmail('undorecur'))
  await page.goto('/app/day')
  await expect(page.getByText('No tasks on this day')).toBeVisible()
  const api = apiAs(context)
  const planDate = (await api.get('/day-plans/')).body.results[0].plan_date
  const weekly = await api.post('/task-templates/', { title: 'Gym', recurrence: 'weekly', weekdays: [isoWeekday(planDate)], starts_on: planDate })
  const daily = await api.post('/task-templates/', { title: 'Stretch', recurrence: 'daily', starts_on: planDate })
  expect([weekly.status, daily.status]).toEqual([201, 201])
  await page.reload()
  await expect(tick(page, 'Gym')).toBeVisible()

  await page.getByRole('button', { name: 'Move Gym', exact: true }).click()
  const gym = page.getByRole('form', { name: 'Move Gym' })
  await gym.getByLabel('Move to').fill(addDays(planDate, 3)) // not a Gym day
  await gym.getByRole('button', { name: 'Move task' }).click()
  await expect(page.getByText(/“Gym” moved to .+\./)).toBeVisible()
  await page.getByRole('button', { name: 'Undo: move of Gym' }).click()
  await expect(tick(page, 'Gym')).toBeVisible()
  const template = (await api.get('/task-templates/')).body.results.find((t) => t.title === 'Gym')
  expect(template).toMatchObject({ recurrence: 'weekly', weekdays: [isoWeekday(planDate)], starts_on: planDate, ends_on: null })
  expect((await rows(context)).filter((o) => o.title === 'Gym')).toHaveLength(1)

  await page.getByRole('button', { name: 'Move Stretch', exact: true }).click()
  const stretch = page.getByRole('form', { name: 'Move Stretch' })
  await stretch.getByLabel('Move to').fill(addDays(planDate, 2)) // a daily task is due on every day
  await stretch.getByRole('button', { name: 'Move task' }).click()
  await expect(page.getByLabel('Set aside tasks')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo: move of Stretch' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo move of Stretch' })).toBeVisible() // the row's own button remains
})
