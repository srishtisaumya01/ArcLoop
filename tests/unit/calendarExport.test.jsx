import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { parseIcs } from '../support/icsParse.js'

const mocks = vi.hoisted(() => ({ getCalendarPlan: vi.fn(), download: vi.fn() }))
vi.mock('../../src/services/planner/index.js', () => ({ plannerService: { getCalendarPlan: mocks.getCalendarPlan } }))
vi.mock('../../src/utils/download.js', () => ({ downloadTextFile: mocks.download }))

const { default: CalendarExport } = await import('../../src/components/reminders/CalendarExport.jsx')

const task = (over) => ({ id: 'o1', templateId: null, title: 'Walk', description: null, category: null, isPriority: false, plannedStart: '09:00', plannedEnd: null, estimatedMinutes: null, ...over })
const plan = (tasks) => ({ timeZone: 'America/New_York', today: '2026-03-10', from: '2026-03-10', to: '2026-03-23', days: [{ date: '2026-03-10', dayMode: 'normal', tasks }] })
const renderCard = () => render(h(ThemeProvider, { theme }, h(MemoryRouter, null, h(CalendarExport))))

describe('CalendarExport card', () => {
  beforeEach(() => {
    mocks.getCalendarPlan.mockReset()
    mocks.download.mockReset()
  })

  it('is honest about what it does: a one-time copy, alerts are only a request, nothing is guaranteed, the file is private', () => {
    renderCard()
    const text = screen.getByRole('region', { name: 'Calendar export' }).textContent
    expect(text).toMatch(/one-time copy: it does not stay up to date/)
    expect(text).toMatch(/cannot guarantee that a notification will appear/)
    expect(text).toMatch(/Keep it private/)
    expect(text).toMatch(/Some calendar apps replace events they already have; others add copies/)
    expect(text).not.toMatch(/you will be reminded|you.ll get a reminder|reminders will/i) // no promise it cannot keep
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')
  })

  it('shows its defaults in plain words: 14 days, no alert', () => {
    renderCard()
    expect(screen.getByRole('combobox', { name: 'Days to include' })).toHaveTextContent('The next 14 days')
    expect(screen.getByRole('combobox', { name: 'Calendar alert' })).toHaveTextContent('No alert') // not a blank box
    expect(screen.getByRole('checkbox', { name: /Include tasks without a time/ })).not.toBeChecked()
  })

  it('downloads a valid calendar file for the chosen options, and tells the person exactly what was saved', async () => {
    const user = userEvent.setup()
    mocks.getCalendarPlan.mockResolvedValue(plan([task({ id: 'a', title: 'Walk' }), task({ id: 'b', title: 'Water plants', plannedStart: null })]))
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Download .ics file' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
    expect(mocks.getCalendarPlan).toHaveBeenCalledWith({ days: 14 }) // the default
    const { filename, text, mime } = mocks.download.mock.calls[0][0]
    expect(filename).toBe('arcloop-plan-2026-03-10-to-2026-03-23.ics')
    expect(mime).toBe('text/calendar;charset=utf-8')
    const file = parseIcs(text)
    expect(file.events.map((e) => [e.summary, e.start])).toEqual([['Walk', '2026-03-10T13:00:00.000Z']]) // 09:00 EDT; the untimed task is left out by default
    expect(file.events[0].alarms).toEqual([]) // no alert unless asked
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/Saved arcloop-plan-2026-03-10-to-2026-03-23\.ics: 1 event/)
    expect(status).toHaveTextContent('1 task without a time was left out.')
    expect(status).toHaveTextContent('America/New_York')
  })

  it('passes the options through: days, all-day events for untimed tasks, and an alert', async () => {
    const user = userEvent.setup()
    mocks.getCalendarPlan.mockResolvedValue(plan([task({ title: 'Walk' }), task({ id: 'b', title: 'Water plants', plannedStart: null })]))
    renderCard()
    await user.click(screen.getByRole('combobox', { name: 'Days to include' }))
    await user.click(await screen.findByRole('option', { name: 'The next 30 days' }))
    await user.click(screen.getByRole('checkbox', { name: /Include tasks without a time/ }))
    await user.click(screen.getByRole('combobox', { name: 'Calendar alert' }))
    await user.click(await screen.findByRole('option', { name: '15 minutes before' }))
    await user.click(screen.getByRole('button', { name: 'Download .ics file' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalled())
    expect(mocks.getCalendarPlan).toHaveBeenCalledWith({ days: 30 })
    const file = parseIcs(mocks.download.mock.calls[0][0].text)
    const rows = file.events.map((e) => [e.summary, e.allDay, e.alarms.map((alarm) => alarm.trigger)]).sort((x, y) => x[0].localeCompare(y[0]))
    expect(rows).toEqual([['Walk', false, ['-PT15M']], ['Water plants', true, []]]) // an all-day event gets no alert
    expect(screen.queryByText(/left out/)).toBeNull()
  })

  it('says so when there is nothing to add, and still downloads a valid (empty) calendar', async () => {
    const user = userEvent.setup()
    mocks.getCalendarPlan.mockResolvedValue(plan([]))
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Download .ics file' }))
    expect(await screen.findByText('There was nothing to add for those days.')).toBeInTheDocument()
    expect(parseIcs(mocks.download.mock.calls[0][0].text).events).toEqual([])
  })

  it('shows the service’s message in an alert when the plan cannot be read, and downloads nothing', async () => {
    const user = userEvent.setup()
    mocks.getCalendarPlan.mockRejectedValue(Object.assign(new Error('We could not reach the server. Check your connection and try again.'), { code: 'NETWORK' }))
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Download .ics file' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server.')
    expect(mocks.download).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Download .ics file' })).toBeEnabled() // and can be tried again
  })

  it('is busy while it works, so a double click cannot make two files', async () => {
    const user = userEvent.setup()
    let release
    mocks.getCalendarPlan.mockReturnValue(new Promise((resolve) => { release = () => resolve(plan([task()])) }))
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Download .ics file' }))
    const busy = await screen.findByRole('button', { name: 'Preparing…' })
    expect(busy).toBeDisabled()
    release()
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
    expect(within(screen.getByRole('region', { name: 'Calendar export' })).getByRole('button', { name: 'Download .ics file' })).toBeEnabled()
  })
})
