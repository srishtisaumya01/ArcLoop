import { TODAY, USER_ID } from './support/stubApi.js'
import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// Real browser (Chromium), real app and dev server, stubbed API endpoints: see e2e/support/stubApi.js.
// Reminder delivery here is the real in-app scheduler running in the browser; browser notifications use
// Chromium's real permission state (granted per test where needed).

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const prefsRow = (over = {}) => ({ user_id: USER_ID, enabled: true, remind_time: '09:00:00', weekdays: ALL_DAYS, last_notified_on: '1970-01-01', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', ...over })

test.describe('Reminders', () => {
  test('turning reminders on, choosing a time and days, and resetting are saved', async ({ page, api }) => {
    await page.goto('/app/reminders')
    const status = page.getByRole('status', { name: 'Reminder status' })
    await expect(status).toContainText('Reminders are off')
    await expect(page.getByText('No reminders coming up')).toBeVisible()
    const form = page.getByRole('form', { name: 'Daily reminder settings' })
    await form.getByRole('switch').click()
    await form.getByLabel('Reminder time').fill('08:30')
    await form.getByRole('checkbox', { name: 'Sat' }).uncheck()
    await form.getByRole('checkbox', { name: 'Sun' }).uncheck()
    await form.getByRole('button', { name: 'Save settings' }).click()
    await expect(status).toContainText('Reminders are on: 08:30, Mon, Tue, Wed, Thu, Fri')
    await expect(status).toContainText('Next daily reminder: Wednesday 11 Mar at 08:30') // 08:30 has passed today
    expect(api.rows('reminder_preferences')[0]).toMatchObject({ enabled: true, remind_time: '08:30', weekdays: [1, 2, 3, 4, 5] })
    await expectNoHorizontalScroll(page)
    await form.getByRole('button', { name: 'Reset to defaults' }).click()
    await expect(status).toContainText('Reminders are off')
    expect(api.rows('reminder_preferences')).toHaveLength(0)
  })

  test('saving without any weekday shows the planner’s message and saves nothing', async ({ page, api }) => {
    await page.goto('/app/reminders')
    const form = page.getByRole('form', { name: 'Daily reminder settings' })
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await form.getByRole('checkbox', { name: day }).uncheck()
    await form.getByRole('button', { name: 'Save settings' }).click()
    await expect(form.getByText('Choose at least one day of the week.')).toBeVisible()
    expect(api.writes('reminder_preferences')).toEqual([])
  })

  test('a task reminder set in My Day appears under Coming up and can be removed there', async ({ page, api }) => {
    await page.goto('/app/day')
    await page.getByRole('button', { name: 'Set a reminder for Gym session' }).click()
    const form = page.getByRole('form', { name: 'Reminder for Gym session' })
    await form.getByLabel('Remind me at').fill('17:45')
    await form.getByRole('button', { name: 'Save reminder' }).click()
    await expect(page.getByRole('button', { name: 'Change reminder for Gym session' })).toBeVisible()
    await expect(page.getByText('Reminders are off, so this one won’t be sent.')).toBeVisible()
    expect(api.rows('task_reminders')[0]).toMatchObject({ remind_time: '17:45', plan_date: TODAY })
    await page.goto('/app/reminders')
    const upcoming = page.getByRole('region', { name: 'Upcoming reminders' })
    await expect(upcoming).toContainText('Gym session')
    await expect(upcoming).toContainText('Tuesday 10 Mar at 17:45')
    await expect(upcoming).toContainText('Reminders are off, so these won’t be sent')
    await upcoming.getByRole('button', { name: 'Remove reminder for Gym session' }).click()
    await expect(page.getByText('No reminders coming up')).toBeVisible()
    expect(api.rows('task_reminders')).toHaveLength(0)
  })

  test('a due daily reminder is delivered once inside the app, and not again after a reload', async ({ page, api }) => {
    api.rows('reminder_preferences').push(prefsRow({ remind_time: '10:45:00' })) // 15 minutes ago, inside the delivery window
    await page.goto('/app/day')
    const notice = page.getByText('Your day is ready when you are')
    await expect(notice).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open My Day' })).toBeVisible()
    expect(api.rows('reminder_preferences')[0].last_notified_on).toBe(TODAY) // claimed in the database first
    await page.getByRole('status').filter({ hasText: 'Your day is ready' }).getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Morning walk')).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(notice).toHaveCount(0)
  })

  test('a reminder whose time has not come yet is not delivered', async ({ page, api }) => {
    api.rows('reminder_preferences').push(prefsRow({ remind_time: '11:30:00' })) // 30 minutes from now
    await page.goto('/app/day')
    await expect(page.getByText('Morning walk')).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page.getByText('Your day is ready when you are')).toHaveCount(0)
    expect(api.rows('reminder_preferences')[0].last_notified_on).toBe('1970-01-01')
  })

  // Headless Chromium reports notification permission as 'denied' (and may ignore grantPermissions), so this checks
  // that the page describes whatever state the real browser has, and never asks on its own.
  test('browser notifications: the page describes the real permission state and only asks from the button', async ({ page, context }) => {
    await context.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:5200' }).catch(() => {})
    await page.goto('/app/reminders')
    const card = page.getByLabel('Browser notifications').first()
    await expect(card).toContainText('Reminders are delivered while Arcloop is open in a browser tab')
    const permission = await page.evaluate(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
    const allowButton = page.getByRole('button', { name: 'Allow browser notifications' })
    if (permission === 'granted') {
      await expect(card).toContainText('Browser notifications are allowed for Arcloop.')
      await expect(allowButton).toHaveCount(0)
    } else if (permission === 'denied') {
      await expect(card).toContainText('blocked for this site in your browser')
      await expect(allowButton).toHaveCount(0)
    } else if (permission === 'default') {
      await expect(card).toContainText('not allowed yet')
      await expect(allowButton).toBeVisible()
    } else {
      await expect(card).toContainText('doesn’t support notifications')
    }
    test.info().annotations.push({ type: 'notification permission in this browser', description: permission })
  })

  test.describe('error and loading', () => {
    test.describe('error', () => {
      test.use({ apiMode: 'error' })
      test('a failed load shows a calm message with retry, and recovers', async ({ page, api }) => {
        await page.goto('/app/reminders')
        const alert = page.getByRole('alert')
        await expect(alert).toContainText('We couldn’t load your reminders')
        await expect(page.getByText(/stubbed failure/)).toHaveCount(0)
        api.setMode('normal')
        await alert.getByRole('button', { name: 'Try again' }).click()
        await expect(page.getByRole('status', { name: 'Reminder status' })).toBeVisible()
      })
    })
    test.describe('loading', () => {
      test.use({ apiMode: 'slow' })
      test('a slow load shows the loading state first', async ({ page }) => {
        await page.goto('/app/reminders')
        await expect(page.getByLabel('Loading reminders')).toBeVisible()
        await expect(page.getByRole('status', { name: 'Reminder status' })).toBeVisible({ timeout: 15000 })
      })
    })
  })
})

test.describe('Settings', () => {
  test('profile: unsaved changes can be discarded or saved, and saved values come back after a reload', async ({ page, api }) => {
    await page.goto('/app/settings')
    const form = page.getByRole('form', { name: 'Profile' })
    const name = form.getByLabel('Display name (optional)')
    await expect(name).toHaveValue('Asha')
    await expect(form.getByRole('button', { name: 'Save profile' })).toBeDisabled()
    await name.fill('Asha B.')
    await expect(form.getByText('You have unsaved changes.')).toBeVisible()
    await form.getByRole('button', { name: 'Discard changes' }).click()
    await expect(name).toHaveValue('Asha')
    expect(api.writes('profiles')).toEqual([])
    await name.fill('Asha B.')
    await form.getByLabel('Timezone').selectOption('Europe/London')
    await form.getByRole('button', { name: 'Save profile' }).click()
    await expect(form.getByText('Saved. Your day, week and reminders now follow Europe/London.')).toBeVisible()
    expect(api.rows('profiles')[0]).toMatchObject({ display_name: 'Asha B.', timezone: 'Europe/London' })
    await page.reload()
    await expect(page.getByRole('form', { name: 'Profile' }).getByLabel('Display name (optional)')).toHaveValue('Asha B.')
    await expect(page.getByRole('form', { name: 'Profile' }).getByLabel('Timezone')).toHaveValue('Europe/London')
    await expectNoHorizontalScroll(page)
  })

  test('privacy saves on its own and leaves the profile fields alone', async ({ page, api }) => {
    await page.goto('/app/settings')
    const privacy = page.getByRole('form', { name: 'Privacy' })
    await privacy.getByRole('combobox', { name: /Progress visibility/ }).click()
    await page.getByRole('option', { name: 'Public' }).click()
    await expect(privacy.getByText('You have unsaved changes.')).toBeVisible()
    await privacy.getByRole('button', { name: 'Save privacy' }).click()
    await expect(privacy.getByText('Saved.')).toBeVisible()
    expect(api.rows('profiles')[0]).toMatchObject({ progress_visibility: 'public', profile_visibility: 'private', display_name: 'Asha' })
  })

  test('shows the reminders status, the account email, and links to reminders and the password flow', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByText('Reminders are off')).toBeVisible()
    await expect(page.getByText('asha@example.com')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/update-password')
    // Deleting the account is a separate, guarded flow: nothing happens until the password and the word DELETE are given.
    await page.getByRole('button', { name: 'Delete account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Keep my account' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('link', { name: 'Manage reminders' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible()
  })

  test.describe('timezone prompt', () => {
    test.use({ timezoneId: 'Asia/Kolkata' })
    test('offers this device’s timezone while the profile is still on UTC, and applies it only when chosen', async ({ page, api }) => {
      api.rows('profiles')[0].timezone = 'UTC'
      await page.goto('/app/week')
      const prompt = page.getByRole('region', { name: 'Timezone suggestion' })
      await expect(prompt).toContainText('this device is in Asia/Kolkata')
      expect(api.writes('profiles')).toEqual([]) // nothing changed by itself
      await prompt.getByRole('button', { name: 'Use Asia/Kolkata' }).click()
      await expect(prompt).toHaveCount(0)
      expect(api.rows('profiles')[0]).toMatchObject({ timezone: 'Asia/Kolkata', display_name: 'Asha' })
      await page.goto('/app/settings')
      await expect(page.getByRole('form', { name: 'Profile' }).getByLabel('Timezone')).toHaveValue('Asia/Kolkata')
    })
  })

  test.describe('error and loading', () => {
    test.describe('error', () => {
      test.use({ apiMode: 'error' })
      test('a failed load shows a calm message with retry, and recovers', async ({ page, api }) => {
        await page.goto('/app/settings')
        const alert = page.getByRole('alert')
        await expect(alert).toContainText('We couldn’t load your settings')
        api.setMode('normal')
        await alert.getByRole('button', { name: 'Try again' }).click()
        await expect(page.getByRole('form', { name: 'Profile' })).toBeVisible()
      })
    })
    test.describe('loading', () => {
      test.use({ apiMode: 'slow' })
      test('a slow load shows the loading state first', async ({ page }) => {
        await page.goto('/app/settings')
        await expect(page.getByLabel('Loading your settings')).toBeVisible()
        await expect(page.getByRole('form', { name: 'Profile' })).toBeVisible({ timeout: 15000 })
      })
    })
  })
})
