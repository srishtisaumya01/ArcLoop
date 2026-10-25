import { createElement as h } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import ScheduleNotice from '../../src/components/planner/ScheduleNotice.jsx'
import { checkSchedule } from '../../src/components/planner/scheduleChecks.js'

// The calm note above the schedule: what it says, that it changes nothing, and that "Not now" hides it for this day until something new turns up.
const task = (id, over = {}) => ({ id, title: id, plannedStart: null, plannedEnd: null, estimatedMinutes: null, completion: 0, ...over })
const overlapping = [task('Dentist', { plannedStart: '09:00', plannedEnd: '09:45' }), task('Call mum', { plannedStart: '09:30', plannedEnd: '10:00' })]
const renderNotice = (props) => render(h(ThemeProvider, { theme }, h(ScheduleNotice, { date: '2026-03-10', checks: checkSchedule({ tasks: overlapping, nowMinutes: null }), ...props })))

beforeEach(() => localStorage.clear())

describe('ScheduleNotice', () => {
  it('names the overlap and says nothing was changed', () => {
    renderNotice()
    const note = screen.getByRole('region', { name: 'Schedule check' })
    expect(note).toHaveTextContent('“Dentist” (09:00 to 09:45) overlaps “Call mum” (09:30 to 10:00).')
    expect(note).toHaveTextContent('Nothing has changed.')
    expect(screen.getByRole('heading', { name: 'A look at this schedule' })).toBeInTheDocument()
  })

  it('shows nothing when there is nothing to point out', () => {
    renderNotice({ checks: checkSchedule({ tasks: [task('a', { plannedStart: '09:00', plannedEnd: '10:00' })], nowMinutes: null }) })
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
  })

  it('shows the load warning too, and lists at most four lines with a count of the rest', () => {
    const many = Array.from({ length: 6 }, (_, i) => task(`T${i}`, { plannedStart: '09:00', plannedEnd: '10:00' })) // every pair overlaps: 15 findings
    renderNotice({ checks: checkSchedule({ tasks: many, nowMinutes: null }) })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('And 11 more.')).toBeInTheDocument()
  })

  it('“Not now” hides it for this day, and it stays hidden after a reload', async () => {
    const user = userEvent.setup()
    const first = renderNotice()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
    first.unmount()
    renderNotice() // the same findings on the same day
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
  })

  it('comes back for something new, and is not hidden on another day', async () => {
    const user = userEvent.setup()
    const first = renderNotice()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    first.unmount()
    const third = task('Gym', { plannedStart: '09:40', plannedEnd: '10:30' })
    renderNotice({ checks: checkSchedule({ tasks: [...overlapping, third], nowMinutes: null }) }) // a new overlap
    expect(screen.getByRole('region', { name: 'Schedule check' })).toBeInTheDocument()
  })

  it('the same findings on another day are shown', () => {
    localStorage.setItem(`arcloop.dismissed.scheduleCheck:2026-03-09:${JSON.stringify([[['Dentist', 'Call mum']], null])}`, '1')
    renderNotice()
    expect(screen.getByRole('region', { name: 'Schedule check' })).toBeInTheDocument()
  })
})
