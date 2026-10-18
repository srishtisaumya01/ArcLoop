import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { parseIcs } from '../tests/support/icsParse.js'
import { apiAs, signUpViaForm, uniqueEmail } from './support/helpers.js'

// The calendar export against the REAL server and the browser's real clock: a task made in the real My Day form, a real
// profile timezone, a real download parsed by an independent iCalendar parser. Expected instants are worked out here from
// the zone's stated UTC offset, not by the application's own code.

const localDate = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()) // YYYY-MM-DD "today" in that zone

async function exportCalendar(page, { days } = {}) {
  await page.goto('/app/reminders')
  const card = page.getByRole('region', { name: 'Calendar export' })
  await expect(card).toBeVisible()
  if (days) {
    await card.getByRole('combobox', { name: 'Days to include' }).click()
    await page.getByRole('option', { name: `The next ${days} days` }).click()
  }
  const download = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download .ics file' }).click()
  const file = await download
  return parseIcs(await readFile(await file.path(), 'utf8'))
}

test('a timed task is exported at the right moment for the person’s profile timezone, and only for them', async ({ browser, page, context, baseURL }) => {
  await signUpViaForm(page, uniqueEmail('cal'))
  // A zone with a half-hour offset, set the way the app stores it. (UTC+5:30, no daylight saving.)
  expect((await apiAs(context).patch('/profile/', { timezone: 'Asia/Kolkata' })).status).toBe(200)

  await page.goto('/app/day')
  const add = page.getByRole('form', { name: 'Add a task' })
  await add.getByLabel('Task').fill('Standup')
  await add.getByLabel('Start time (optional)').fill('09:00')
  await add.getByLabel('End time (optional)').fill('09:30')
  await add.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('button', { name: 'Done: Standup', exact: true })).toBeVisible()

  const file = await exportCalendar(page, { days: 7 })
  const [y, m, d] = localDate('Asia/Kolkata').split('-').map(Number)
  const kolkata = (hour, minute) => new Date(Date.UTC(y, m - 1, d, hour, minute) - 330 * 60000).toISOString() // 09:00 at UTC+5:30 is 03:30 UTC
  const standups = file.events.filter((e) => e.summary === 'Standup')
  expect(standups).toHaveLength(1) // a one-off task: one event, not one per day
  expect(standups[0]).toMatchObject({ start: kolkata(9, 0), end: kolkata(9, 30), allDay: false })
  expect(standups[0].start.endsWith('T03:30:00.000Z')).toBe(true)
  expect(standups[0].alarms).toEqual([]) // nothing is promised: no alert unless the person asked for one

  // Another person, signed in separately, gets none of it.
  const other = await browser.newContext({ baseURL })
  const otherPage = await other.newPage()
  await signUpViaForm(otherPage, uniqueEmail('calother'))
  expect((await exportCalendar(otherPage)).events).toEqual([])
  await other.close()
})

test('a repeating task is written out day by day, on the local days it falls on', async ({ page, context }) => {
  await signUpViaForm(page, uniqueEmail('calrep'))
  await apiAs(context).patch('/profile/', { timezone: 'Pacific/Auckland' })
  const today = localDate('Pacific/Auckland')
  const created = await apiAs(context).post('/task-templates/', { title: 'Daily review', recurrence: 'daily', starts_on: today, planned_start: '07:00:00', planned_end: '07:15:00' })
  expect(created.status).toBe(201)

  const file = await exportCalendar(page, { days: 7 })
  const reviews = file.events.filter((e) => e.summary === 'Daily review')
  expect(reviews).toHaveLength(7)
  // 07:00 in Auckland on each of the seven local days, as UTC: the offset is +13:00 (summer) or +12:00 (winter), read from the date itself.
  const [y, m, d] = today.split('-').map(Number)
  reviews.forEach((event, index) => {
    const day = new Date(Date.UTC(y, m - 1, d + index))
    const offsetHours = new Intl.DateTimeFormat('en', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' }).formatToParts(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12))).find((p) => p.type === 'timeZoneName').value // e.g. GMT+13:00
    const hours = Number(offsetHours.replace('GMT', '').split(':')[0])
    expect(event.start, `day ${index}`).toBe(new Date(Date.UTC(y, m - 1, d + index, 7) - hours * 3600000).toISOString())
  })
  expect(new Set(reviews.map((e) => e.uid)).size).toBe(7) // each day its own event id
})
