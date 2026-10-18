import { expect, test } from '@playwright/test'
import { apiAs, signUpViaForm, uniqueEmail } from './support/helpers.js'

// Minimum Day through the real UI, the real Django API and a real SQLite file: the label is saved by the server, it is
// validated there (three at most, planned tasks only, your own tasks only, a CSRF-protected write), and it never changes the
// day's percentage.

async function addTask(page, title) {
  const add = page.getByRole('form', { name: 'Add a task' })
  await add.getByLabel(/^Task/).fill(title)
  await add.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('button', { name: `Done: ${title}`, exact: true })).toBeVisible()
}

const panelOf = (page) => page.getByRole('region', { name: 'Minimum Day' })

// Tasks created straight through the API (the add-task form is covered by planner.spec.js): opening My Day creates today's
// day, then each task is added to that exact date and the page is reloaded to show them.
async function seedTasks(page, context, titles) {
  await page.goto('/app/day')
  await expect(page.getByText('No tasks on this day')).toBeVisible() // the page has opened (created) today's day
  const api = apiAs(context)
  const planDate = (await api.get('/day-plans/')).body.results[0].plan_date
  for (const title of titles) expect((await api.post('/task-occurrences/', { plan_date: planDate, title })).status).toBe(201)
  await page.reload()
  await expect(page.getByRole('button', { name: `Done: ${titles.at(-1)}`, exact: true })).toBeVisible()
}

test('choose a minimum, finish it, reload: the server keeps it and the day percentage is not changed', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('minimum'))
  await seedTasks(page, context, ['Write', 'Walk', 'Read', 'Tidy'])

  const panel = panelOf(page)
  await panel.getByRole('button', { name: 'Choose your minimum' }).click()
  await panel.getByRole('checkbox', { name: 'Write' }).check()
  await panel.getByRole('checkbox', { name: 'Walk' }).check()
  await panel.getByRole('button', { name: 'Save minimum' }).click()
  await expect(panel.getByRole('list', { name: 'Your minimum tasks' }).getByRole('listitem')).toHaveCount(2)
  await expect(panel.getByRole('status')).toHaveText('Your minimum is still here whenever you’re ready.')

  await page.getByRole('button', { name: 'Done: Write', exact: true }).click()
  await page.getByRole('button', { name: 'Done: Walk', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('You showed up for yourself today.')
  await expect(page.getByText('50% of today’s plan')).toBeVisible() // two of four: completing the minimum does not complete the day

  await page.reload()
  await expect(panelOf(page).getByRole('list', { name: 'Your minimum tasks' })).toContainText('Write · Done')
  await expect(page.getByText('50% of today’s plan')).toBeVisible()
  const rows = (await apiAs(context).get('/task-occurrences/')).body.results
  expect(rows.filter((o) => o.is_minimum).map((o) => o.title).sort()).toEqual(['Walk', 'Write'])
  expect(rows.filter((o) => o.completion === 0).map((o) => o.title).sort()).toEqual(['Read', 'Tidy']) // the other tasks were not touched
})

test('the server holds the rules even when a client ignores them: a fourth task, a missing CSRF header, someone else’s task', async ({ browser, page, context, baseURL }) => {
  await signUpViaForm(page, uniqueEmail('minrules'))
  await seedTasks(page, context, ['A', 'B', 'C', 'D'])
  const api = apiAs(context)
  const tasks = (await api.get('/task-occurrences/')).body.results
  const id = (title) => tasks.find((t) => t.title === title).id

  for (const title of ['A', 'B', 'C']) expect((await api.patch(`/task-occurrences/?id=${id(title)}`, { is_minimum: true })).status).toBe(200)
  const fourth = await api.patch(`/task-occurrences/?id=${id('D')}`, { is_minimum: true })
  expect([fourth.status, fourth.body.error.code]).toEqual([400, 'limit_reached'])
  const noCsrf = await api.patch(`/task-occurrences/?id=${id('D')}`, { is_minimum: true }, { csrf: false })
  expect(noCsrf.status).toBe(403) // a cookie alone is not enough to write
  expect((await api.patch(`/task-occurrences/?id=${id('D')}`, { is_minimum: 'yes' })).status).toBe(400)

  const other = await browser.newContext({ baseURL })
  const otherPage = await other.newPage()
  await signUpViaForm(otherPage, uniqueEmail('minother'))
  const theirs = await apiAs(other).patch(`/task-occurrences/?id=${id('A')}`, { is_minimum: false })
  expect(theirs.body.results).toEqual([]) // not found for anyone else
  await other.close()

  await page.reload()
  await expect(panelOf(page).getByRole('list', { name: 'Your minimum tasks' }).getByRole('listitem')).toHaveCount(3)
})

test('setting a task aside takes it out of the minimum; a Busy day does not propose setting the minimum aside', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('minbusy'))
  await page.goto('/app/day')
  for (const title of ['Keep', 'Other']) await addTask(page, title)
  const panel = panelOf(page)
  await panel.getByRole('button', { name: 'Choose your minimum' }).click()
  await panel.getByRole('checkbox', { name: 'Keep' }).check()
  await panel.getByRole('button', { name: 'Save minimum' }).click()
  await expect(panel.getByRole('list', { name: 'Your minimum tasks' })).toContainText('Keep')

  await page.getByRole('button', { name: 'Busy' }).click()
  const busy = page.getByRole('region', { name: 'Busy day' })
  await expect(busy.getByRole('listitem')).toHaveText(['Other'])
  expect((await apiAs(context).get('/task-occurrences/')).body.results.every((o) => o.plan_state === 'active')).toBe(true) // nothing set aside by itself

  await page.getByRole('button', { name: 'Set aside Keep' }).click()
  await expect(panel).toContainText('You haven’t chosen a minimum for this day. That is fine.')
  const kept = (await apiAs(context).get('/task-occurrences/')).body.results.find((o) => o.title === 'Keep')
  expect([kept.plan_state, kept.is_minimum]).toEqual(['excluded', false])
})
