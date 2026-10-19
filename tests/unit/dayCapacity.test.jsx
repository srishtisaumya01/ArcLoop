import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import DayCapacity from '../../src/components/planner/DayCapacity.jsx'
import { readAvailable } from '../../src/hooks/useAvailableTime.js'

// The capacity note: how full the day is against the person's own time, and a gentle, optional suggestion when it is over.
let n = 0
const task = (title, over = {}) => ({ id: `id-${title}-${(n += 1)}`, title, templateId: null, planState: 'active', completion: 0, priorityLevel: 'medium', estimatedMinutes: 60, plannedStart: null, plannedEnd: null, ...over })

function renderNote(over = {}) {
  const props = {
    date: '2026-03-10', tasks: [task('Plan', { priorityLevel: 'high' })], available: 360, onChangeAvailable: vi.fn(), canMove: true, nextLabel: 'Wednesday 11 Mar',
    busy: false, onMove: vi.fn().mockResolvedValue({ ok: true }), getRepeatingIds: vi.fn().mockResolvedValue(new Set(['tpl-r'])), notice: null, ...over,
  }
  render(h(ThemeProvider, { theme }, h(DayCapacity, props)))
  return props
}
const overloaded = () => [
  task('Report', { priorityLevel: 'high', estimatedMinutes: 240 }),
  task('Tidy desk', { priorityLevel: 'low', estimatedMinutes: 90 }),
  task('Emails', { priorityLevel: 'medium', estimatedMinutes: 60 }),
  task('Gym', { priorityLevel: 'low', estimatedMinutes: 60, templateId: 'tpl-r' }),
] // 450 minutes in 360 available: 90 over

beforeEach(() => localStorage.clear())

describe('DayCapacity', () => {
  it('shows planned time against the time available, with a labelled bar', () => {
    renderNote({ tasks: [task('Plan', { estimatedMinutes: 120 })] })
    const region = screen.getByRole('region', { name: 'Day capacity' })
    expect(within(region).getByText('2 h planned of 6 h available.')).toBeInTheDocument()
    expect(within(region).getByRole('progressbar', { name: 'Planned time: 33 percent of the time available' })).toBeInTheDocument()
    expect(screen.queryByText(/If you like/)).toBeNull()
  })

  it('says nothing for a day with nothing planned', () => {
    renderNote({ tasks: [] })
    expect(screen.queryByRole('region', { name: 'Day capacity' })).toBeNull()
  })

  it('the time available is chosen in half hours and reported as a number of minutes', async () => {
    const user = userEvent.setup()
    const { onChangeAvailable } = renderNote()
    const select = screen.getByLabelText('Time you have for tasks')
    expect(select).toHaveValue('360')
    expect(select.options[0].textContent).toBe('30 min')
    await user.selectOptions(select, '480')
    expect(onChangeAvailable).toHaveBeenCalledWith(480)
  })

  it('when the day holds more, gently suggests the lowest priority tasks that are not repeating, and moves nothing by itself', async () => {
    const { onMove } = renderNote({ tasks: overloaded() })
    expect(screen.getByText('7 h 30 min planned of 6 h available: 1 h 30 min more than the time you have.')).toBeInTheDocument()
    expect(await screen.findByText(/If you like, you could move “Tidy desk” to Wednesday 11 Mar/)).toBeInTheDocument() // low, and 90 minutes frees enough
    expect(screen.queryByText(/“Gym”/)).toBeNull() // repeating
    expect(screen.queryByText(/“Report”/)).toBeNull() // high
    expect(onMove).not.toHaveBeenCalled()
  })

  it('moves exactly the suggested tasks when the button is pressed', async () => {
    const user = userEvent.setup()
    const tasks = overloaded()
    const { onMove } = renderNote({ tasks })
    await user.click(await screen.findByRole('button', { name: 'Move 1 to Wednesday 11 Mar' }))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith([tasks[1].id])
  })

  it('"Not now" hides the suggestion and keeps the figures', async () => {
    const user = userEvent.setup()
    renderNote({ tasks: overloaded() })
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/If you like/)).toBeNull()
    expect(screen.getByText(/more than the time you have/)).toBeInTheDocument()
  })

  it('is off while a change is being saved', async () => {
    renderNote({ tasks: overloaded(), busy: true })
    expect(await screen.findByRole('button', { name: 'Move 1 to Wednesday 11 Mar' })).toBeDisabled()
  })

  it('on a day that cannot be changed, or with no next day to plan, it shows the figures and suggests nothing', async () => {
    const getRepeatingIds = vi.fn().mockResolvedValue(new Set())
    renderNote({ tasks: overloaded(), canMove: false, getRepeatingIds })
    expect(screen.getByText(/more than the time you have/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move/ })).toBeNull()
    expect(getRepeatingIds).not.toHaveBeenCalled() // not even asked
  })

  it('when nothing is easy to move it says so instead of offering a button', async () => {
    renderNote({ tasks: [task('Report', { priorityLevel: 'high', estimatedMinutes: 500 })] })
    expect(await screen.findByText(/Nothing here is an easy one to move/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })

  it('treats nothing as repeating if the templates cannot be read, and still works', async () => {
    renderNote({ tasks: overloaded(), getRepeatingIds: vi.fn().mockRejectedValue(new Error('offline')) })
    expect(await screen.findByText(/If you like, you could move “Tidy desk”/)).toBeInTheDocument()
  })

  it('asks which tasks repeat only once, and only when the day is over', async () => {
    const getRepeatingIds = vi.fn().mockResolvedValue(new Set())
    const { rerender } = render(h(ThemeProvider, { theme }, h(DayCapacity, { date: 'd', tasks: [task('A')], available: 360, onChangeAvailable() {}, canMove: true, nextLabel: 'x', busy: false, onMove() {}, getRepeatingIds, notice: null })))
    expect(getRepeatingIds).not.toHaveBeenCalled()
    rerender(h(ThemeProvider, { theme }, h(DayCapacity, { date: 'd', tasks: overloaded(), available: 360, onChangeAvailable() {}, canMove: true, nextLabel: 'x', busy: false, onMove() {}, getRepeatingIds, notice: null })))
    await waitFor(() => expect(getRepeatingIds).toHaveBeenCalledTimes(1))
  })

  it('reads out the words about the last move politely', () => {
    renderNote({ notice: '1 task moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.' })
    expect(screen.getByRole('status')).toHaveTextContent('1 task moved to Wednesday 11 Mar.')
  })
})

describe('the saved time available', () => {
  const store = (value) => ({ getItem: () => value })
  it('is read back when it is a valid number of minutes, else the default of 6 hours', () => {
    expect(readAvailable('u', store('480'))).toBe(480)
    for (const bad of [null, '', 'abc', '10', '99999', '361.5']) expect(readAvailable('u', store(bad)), String(bad)).toBe(360)
    expect(readAvailable('u', null)).toBe(360)
    expect(readAvailable('u', { getItem() { throw new Error('blocked') } })).toBe(360)
  })
})
