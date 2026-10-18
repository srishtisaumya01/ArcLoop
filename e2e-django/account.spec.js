import { expect, test } from '@playwright/test'
import { PASSWORD, SESSION_COOKIE, apiAs, cookieOf, logInViaForm, signUpViaForm, uniqueEmail } from './support/helpers.js'

// Account deletion through the real UI and API. Every account here is created by the test itself.

test('deleting an account needs the password and DELETE, removes everything, and leaves other users alone', async ({ browser, page, context, baseURL }) => {
  test.slow() // two sign-ups and a long journey: comfortable when the dev server is warm, tight when it is cold
  const other = await (await browser.newContext({ baseURL })).newPage()
  await signUpViaForm(other, uniqueEmail('bystander'))
  await other.goto('/app/day')
  const add = other.getByRole('form', { name: 'Add a task' })
  await add.getByLabel(/^Task/).fill('Bystander task')
  await add.getByRole('button', { name: 'Add task' }).click()
  await expect(other.getByRole('checkbox', { name: 'Done: Bystander task', exact: true })).toBeVisible()

  const email = uniqueEmail('doomed')
  await signUpViaForm(page, email)
  await page.goto('/app/day')
  const form = page.getByRole('form', { name: 'Add a task' })
  await form.getByLabel(/^Task/).fill('Soon gone')
  await form.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('checkbox', { name: 'Done: Soon gone', exact: true })).toBeVisible()
  // A copy of this session's cookies, as someone who had stolen them would hold: it must be useless once the account is gone.
  const stolen = await browser.newContext({ baseURL, storageState: await context.storageState() })

  await page.goto('/app/settings')
  await page.getByRole('button', { name: 'Delete account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  const confirm = dialog.getByRole('button', { name: 'Delete everything' })
  await expect(confirm).toBeDisabled() // nothing typed yet
  await dialog.getByLabel('Your password').fill('not-my-password-1')
  await dialog.getByLabel('Type DELETE to confirm').fill('delete')
  await expect(confirm).toBeDisabled() // the word must be exactly DELETE
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
  await confirm.click()
  await expect(dialog.getByRole('alert')).toContainText('Your password is incorrect.')
  expect((await apiAs(stolen).get('/auth/me/')).status).toBe(200) // a refused attempt deletes nothing

  await dialog.getByRole('button', { name: 'Keep my account' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete account' }).click()
  await dialog.getByLabel('Your password').fill(PASSWORD)
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
  await confirm.click()

  // Signed out and sent to the log-in page; the cookie is gone; the stolen copy and the old credentials are dead; a repeat request is refused.
  await expect(page).toHaveURL(/\/login$/)
  expect(await cookieOf(context, SESSION_COOKIE)).toBeNull()
  expect((await apiAs(stolen).get('/auth/me/')).status).toBe(401)
  expect((await apiAs(stolen).post('/auth/account/delete/', { password: PASSWORD, confirmation: 'DELETE' })).status).toBe(401)
  await stolen.close()
  await logInViaForm(page, email)
  await expect(page.getByRole('alert')).toContainText(/incorrect/i)

  // Another user's data is untouched.
  await other.reload()
  await expect(other.getByRole('checkbox', { name: 'Done: Bystander task', exact: true })).toBeVisible()
})
