import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import DaySchedule from '../../src/components/planner/DaySchedule.jsx'
import { scheduleMarkers } from '../../src/components/planner/scheduleMarkers.js'

// The schedule view: tasks with a time apart from the ones without, in time order, with "Now" and "Next up" on today.
const task = (id, over = {}) => ({ id, title: id, plannedStart: null, plannedEnd: null, estimatedMinutes: null, completion: 0, ...over })
const at = (h, m = 0) => h * 60 + m
const tasks = [
  task('Stretch', { plannedStart: '07:00', plannedEnd: '07:30' }),
  task('Report', { plannedStart: '09:00', plannedEnd: '11:00' }),
  task('Gym', { plannedStart: '17:00' }),
  task('Read'),
  task('Call mum'),
]
const render1 = (props) => render(h(ThemeProvider, { theme }, h(DaySchedule, { tasks, nowMinutes: null, renderTask: (t, marker) => h('li', { key: t.id }, `${t.title}${marker ? ` [${marker}]` : ''}`), ...props })))

describe('scheduleMarkers', () => {
  it('marks the block under way as Now and the first one still to come as Next up', () => {
    const m = scheduleMarkers(tasks.filter((t) => t.plannedStart), at(9, 30))
    expect([...m]).toEqual([['Report', 'now'], ['Gym', 'next']])
  })

  it('before the first block, the first is Next up', () => {
    expect([...scheduleMarkers(tasks, at(6))]).toEqual([['Stretch', 'next']])
  })

  it('after the last block there is nothing to mark', () => {
    expect([...scheduleMarkers(tasks, at(23))]).toEqual([])
  })

  it('a block with a start but no end counts as half an hour, or as long as its estimate', () => {
    expect(scheduleMarkers([task('A', { plannedStart: '10:00' })], at(10, 20)).get('A')).toBe('now')
    expect(scheduleMarkers([task('A', { plannedStart: '10:00' })], at(10, 40)).get('A')).toBeUndefined()
    expect(scheduleMarkers([task('A', { plannedStart: '10:00', estimatedMinutes: 90 })], at(11, 20)).get('A')).toBe('now')
  })

  it('never marks a done task, and marks nothing when the day is not today', () => {
    const m = scheduleMarkers([task('Report', { plannedStart: '09:00', plannedEnd: '11:00', completion: 1 }), task('Gym', { plannedStart: '17:00' })], at(9, 30))
    expect([...m]).toEqual([['Gym', 'next']])
    expect(scheduleMarkers(tasks, null).size).toBe(0)
  })

  it('the end of a block is not part of it', () => {
    expect(scheduleMarkers([task('A', { plannedStart: '09:00', plannedEnd: '10:00' })], at(10)).size).toBe(0)
  })
})

describe('DaySchedule', () => {
  it('separates what has a time (in order) from what can happen any time', () => {
    render1()
    const scheduled = screen.getByRole('list', { name: 'Scheduled tasks' })
    expect(within(scheduled).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Stretch', 'Report', 'Gym'])
    const anytime = screen.getByRole('list', { name: 'Unscheduled tasks' })
    expect(within(anytime).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Read', 'Call mum'])
    expect(screen.getByRole('heading', { name: 'Scheduled' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anytime' })).toBeInTheDocument()
  })

  it('passes each scheduled task its Now / Next up marker on today', () => {
    render1({ nowMinutes: at(9, 30) })
    expect(screen.getByText('Report [now]')).toBeInTheDocument()
    expect(screen.getByText('Gym [next]')).toBeInTheDocument()
    expect(screen.getByText('Stretch')).toBeInTheDocument() // earlier today: no marker
  })

  it('is the plain list it has always been when no task has a time', () => {
    render1({ tasks: [task('Read'), task('Call mum')] })
    expect(screen.getByRole('list', { name: 'Today’s tasks' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scheduled' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Anytime' })).toBeNull()
  })

  it('has no Anytime section when every task has a time', () => {
    render1({ tasks: tasks.slice(0, 3) })
    expect(screen.getByRole('list', { name: 'Scheduled tasks' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Anytime' })).toBeNull()
  })
})
