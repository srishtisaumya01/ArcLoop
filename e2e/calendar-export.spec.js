import { readFile } from 'node:fs/promises'
import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'
import { parseIcs } from '../tests/support/icsParse.js'

// The calendar card on the Reminders page, in a real browser: the actual downloaded .ics file is read back with an independent
// parser. The browser clock is pinned to Tuesday 10 March 2026, 11:00 in New York (EDT, UTC-4) and the stub holds the seeded
// plan: Read daily at 07:30 for 20 minutes, Gym on Tuesdays and Thursdays 18:00-19:00, a one-off "Call the dentist" today at
// 09:00 for 15 minutes (priority), and an untimed daily "Morning walk". Stubbed API: the real server is in e2e-django.

async function downloadFrom(page, card) {
  const download = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download .ics file' }).click()
  const file = await download
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

async function choose(page, card, label, option) {
  await card.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

test.describe('Add to a calendar', () => {
  test('downloads the real plan for the chosen days as a valid calendar file', async ({ page }) => {
    await page.goto('/app/reminders')
    const card = page.getByRole('region', { name: 'Calendar export' })
    await expect(card).toBeVisible()
    await choose(page, card, 'Days to include', 'The next 7 days')
    const { name, text } = await downloadFrom(page, card)
    expect(name).toBe('arcloop-plan-2026-03-10-to-2026-03-16.ics')

    const file = parseIcs(text)
    expect(file).toMatchObject({ version: '2.0', method: 'PUBLISH', hasTimezoneComponent: false })
    const row = (e) => `${e.summary} | ${e.start} | ${e.end}`
    expect(file.events.map(row)).toEqual([
      'Read for twenty minutes | 2026-03-10T11:30:00.000Z | 2026-03-10T11:50:00.000Z', // 07:30 EDT
      'Call the dentist | 2026-03-10T13:00:00.000Z | 2026-03-10T13:15:00.000Z', // 09:00 EDT, 15 minutes
      'Gym session | 2026-03-10T22:00:00.000Z | 2026-03-10T23:00:00.000Z', // 18:00-19:00 EDT
      'Read for twenty minutes | 2026-03-11T11:30:00.000Z | 2026-03-11T11:50:00.000Z',
      'Read for twenty minutes | 2026-03-12T11:30:00.000Z | 2026-03-12T11:50:00.000Z',
      'Gym session | 2026-03-12T22:00:00.000Z | 2026-03-12T23:00:00.000Z', // Thursday: the repeating task, not yet opened
      'Read for twenty minutes | 2026-03-13T11:30:00.000Z | 2026-03-13T11:50:00.000Z',
      'Read for twenty minutes | 2026-03-14T11:30:00.000Z | 2026-03-14T11:50:00.000Z',
      'Read for twenty minutes | 2026-03-15T11:30:00.000Z | 2026-03-15T11:50:00.000Z',
      'Read for twenty minutes | 2026-03-16T11:30:00.000Z | 2026-03-16T11:50:00.000Z',
    ])
    expect(file.events.find((e) => e.summary === 'Call the dentist').priority).toBe(1)
    expect(file.events.every((e) => e.alarms.length === 0)).toBe(true) // no alert was asked for, none is written
    expect(new Set(file.events.map((e) => e.uid)).size).toBe(file.events.length)

    const status = card.getByRole('status')
    await expect(status).toContainText('Saved arcloop-plan-2026-03-10-to-2026-03-16.ics: 10 events')
    await expect(status).toContainText('7 tasks without a time were left out.')
    await expect(status).toContainText('America/New_York')
  })

  test('adds all-day events and a calendar alert only when asked, and the alert only on timed events', async ({ page }) => {
    await page.goto('/app/reminders')
    const card = page.getByRole('region', { name: 'Calendar export' })
    await choose(page, card, 'Days to include', 'The next 7 days')
    await card.getByRole('checkbox', { name: /Include tasks without a time/ }).check()
    await choose(page, card, 'Calendar alert', '10 minutes before')
    const { text } = await downloadFrom(page, card)
    const file = parseIcs(text)
    const timed = file.events.filter((e) => !e.allDay)
    const allDay = file.events.filter((e) => e.allDay)
    expect([timed.length, allDay.length]).toEqual([10, 7])
    expect(timed.every((e) => e.alarms.length === 1 && e.alarms[0].action === 'DISPLAY' && e.alarms[0].trigger === '-PT10M')).toBe(true)
    expect(allDay.every((e) => e.summary === 'Morning walk' && e.alarms.length === 0 && e.transp === 'TRANSPARENT')).toBe(true)
    expect(allDay.map((e) => e.start)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16'])
    await expect(card.getByRole('status')).not.toContainText('left out')
  })

  test('never promises a notification, and says what it is: a one-time copy, a request, private', async ({ page }) => {
    await page.goto('/app/reminders')
    const card = page.getByRole('region', { name: 'Calendar export' })
    await expect(card).toContainText('one-time copy')
    await expect(card).toContainText('cannot guarantee that a notification will appear')
    await expect(card).toContainText('Keep it private')
    await expect(card).not.toContainText(/you will be reminded|we will remind/i)
  })

  test('fits the screen and every control can be reached', async ({ page }) => {
    await page.goto('/app/reminders')
    const card = page.getByRole('region', { name: 'Calendar export' })
    await card.scrollIntoViewIfNeeded()
    await expectNoHorizontalScroll(page)
    const viewport = page.viewportSize()
    for (const control of [card.getByRole('combobox', { name: 'Days to include' }), card.getByRole('checkbox'), card.getByRole('combobox', { name: 'Calendar alert' }), card.getByRole('button', { name: 'Download .ics file' })]) {
      await control.scrollIntoViewIfNeeded()
      const box = await control.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
  })
})
