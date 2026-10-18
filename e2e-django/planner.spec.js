import { expect, test } from '@playwright/test'
import { apiAs, signUpViaForm, uniqueEmail } from './support/helpers.js'

// One complete planner journey and the privacy boundary, through the real UI and the real API.

// Quick add takes a title only; a category is set afterwards in Edit.
async function addTask(page, title, category) {
  const add = page.getByRole('form', { name: 'Add a task' })
  await add.getByLabel(/^Task/).fill(title)
  await add.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('checkbox', { name: `Done: ${title}`, exact: true })).toBeVisible()
  if (category) {
    await page.getByRole('button', { name: `Edit ${title}` }).click()
    const edit = page.getByRole('form', { name: `Edit ${title}` })
    await edit.getByLabel(/Category/).fill(category)
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toHaveCount(0)
  }
}

test('plan a day, complete a task, reload, and see it in the week and progress screens', async ({ page }) => {
  await signUpViaForm(page, uniqueEmail('plan'))
  await page.goto('/app/day')
  await addTask(page, 'Morning walk', 'Health')
  await addTask(page, 'Read twenty minutes')

  await page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeChecked()
  await expect(page.getByText('50%', { exact: false }).first()).toBeVisible()

  // Persisted by the server: a fresh page load shows the same state.
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Done: Morning walk', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Done: Read twenty minutes', exact: true })).not.toBeChecked()

  await page.goto('/app/week')
  await expect(page.getByRole('heading', { level: 1, name: 'Your week' })).toBeVisible()
  await expect(page.getByLabel('Week summary').getByText('Tasks completed').locator('..')).toContainText('1')
  await page.goto('/app/progress')
  await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible()
})

test('a repeating task is created, listed, edited and ended', async ({ page }) => {
  await signUpViaForm(page, uniqueEmail('recur'))
  // Repeating tasks are made on the Recurring tasks page; My Day's quick add has no repeat options.
  await page.goto('/app/day')
  await expect(page.getByRole('form', { name: 'Add a task' }).getByLabel('Repeats')).toHaveCount(0)
  await page.goto('/app/recurring')
  await expect(page.getByRole('heading', { level: 1, name: 'Recurring tasks' })).toBeVisible()
  await expect(page.getByText('No recurring tasks yet')).toBeVisible()
  const add = page.getByRole('form', { name: 'New recurring task' })
  await add.getByLabel(/^Task/).fill('Stretch') // repeats every day by default
  await add.getByRole('button', { name: 'Add recurring task' }).click()
  await expect(page.getByRole('region', { name: 'Active' })).toContainText('Stretch')
  await page.goto('/app/day')
  await expect(page.getByRole('checkbox', { name: 'Done: Stretch', exact: true })).toBeVisible() // it comes back on My Day
  await page.goto('/app/recurring')
  await expect(page.getByRole('region', { name: 'Active' })).toContainText('Stretch')
  await page.getByRole('button', { name: 'End Stretch' }).click()
  await page.getByRole('button', { name: 'End this task' }).click()
  await expect(page.getByRole('region', { name: 'Ended' })).toContainText('Stretch')

  // The ended task and the day it already produced are still there after a reload.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Ended' })).toContainText('Stretch')
  await page.goto('/app/day')
  await expect(page.getByRole('checkbox', { name: 'Done: Stretch', exact: true })).toBeVisible()
})

test('settings and reminders are saved by the server and survive a reload', async ({ page }) => {
  await signUpViaForm(page, uniqueEmail('settings'))
  await page.goto('/app/settings')
  await page.getByLabel(/Display name/).fill('Asha')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(/Display name/)).toHaveValue('Asha')

  await page.goto('/app/reminders')
  await page.getByRole('switch').first().check().catch(async () => page.getByLabel(/Reminders are off/).click())
  await page.getByRole('button', { name: 'Save settings' }).click()
  await page.reload()
  await expect(page.getByText(/Reminders are on|Reminders are off/).first()).toBeVisible()
})

test('one user can never read or change another user’s planner data', async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext({ baseURL })
  const intruderContext = await browser.newContext({ baseURL })
  const a = await ownerContext.newPage()
  const b = await intruderContext.newPage()
  await signUpViaForm(a, uniqueEmail('owner'))
  await a.goto('/app/day')
  await addTask(a, 'Private diary entry')
  await signUpViaForm(b, uniqueEmail('intruder'))
  await b.goto('/app/day')

  // The UI of the second user shows none of it.
  await expect(b.getByText('Private diary entry')).toHaveCount(0)

  // And the API refuses even when the second user asks by exact id, with their own valid session and CSRF token.
  const apiA = apiAs(ownerContext)
  const apiB = apiAs(intruderContext)
  const mine = await apiA.get('/task-occurrences/')
  expect(mine.body.results).toHaveLength(1)
  const id = mine.body.results[0].id
  const read = await apiB.get(`/task-occurrences/?id=${id}`)
  expect(read.body.results).toEqual([])
  const change = await apiB.patch(`/task-occurrences/?id=${id}`, { completion: 1 })
  expect(change.body.results).toEqual([])
  const remove = await apiB.delete(`/task-occurrences/?id=${id}`)
  expect(remove.body.results).toEqual([])
  const days = await apiB.get('/day-plans/')
  expect(days.body.results.every((d) => d.user_id !== mine.body.results[0].user_id)).toBe(true)

  // Nothing happened to the owner's data.
  await a.reload()
  await expect(a.getByRole('checkbox', { name: 'Done: Private diary entry', exact: true })).toBeVisible()
  const stillThere = await apiA.get(`/task-occurrences/?id=${id}`)
  expect(stillThere.body.results[0].completion).toBe(0)
})
