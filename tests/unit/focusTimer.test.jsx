import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import FocusTimer from '../../src/components/planner/FocusTimer.jsx'
import GrowingTree from '../../src/components/planner/GrowingTree.jsx'

// The focus panel's behaviour for each state it can be in (choose a length, running, paused, summary), with the focus value supplied by the
// test. The timing rules themselves are tested in focusSession.test.js and useFocusSession.test.jsx.
const MIN = 60 * 1000
const T0 = 1_800_000_000_000
const TASK = { id: 't1', planDate: '2026-03-10', title: 'Write the report' }
const session = (over = {}) => ({ v: 1, id: 's1', taskId: 't1', planDate: '2026-03-10', title: 'Write the report', plannedMs: 25 * MIN, status: 'running', startedAt: T0, segmentStartedAt: T0, accumulatedMs: 0, pausedAt: null, ...over })
const focusValue = (over = {}) => ({
  ready: true, session: null, now: T0 + 10 * MIN, result: null, log: [],
  refresh: vi.fn(), start: vi.fn().mockReturnValue({ ok: true }), pause: vi.fn(), resume: vi.fn(), end: vi.fn(), dismissResult: vi.fn(), ...over,
})
function renderPanel({ focus = focusValue(), target = null, ...rest } = {}) {
  const props = { focus, target, viewDate: '2026-03-10', onClearTarget: vi.fn(), canMarkDone: () => true, onMarkDone: vi.fn(), ...rest }
  render(h(ThemeProvider, { theme }, h(FocusTimer, props)))
  return { focus, ...props }
}

describe('choosing a length', () => {
  it('offers 15, 25, 45 and 60 minutes with 25 chosen, for the task that was picked', () => {
    renderPanel({ target: TASK })
    const group = screen.getByRole('group', { name: 'Session length' })
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['15 minutes', '25 minutes', '45 minutes', '60 minutes'])
    expect(within(group).getByRole('button', { name: '25 minutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Focus on “Write the report”' })).toBeInTheDocument()
  })

  it('starts the chosen length for that task and then lets go of the choice', async () => {
    const user = userEvent.setup()
    const { focus, onClearTarget } = renderPanel({ target: TASK })
    await user.click(screen.getByRole('button', { name: '45 minutes' }))
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    expect(focus.start).toHaveBeenCalledWith(TASK, 45)
    expect(onClearTarget).toHaveBeenCalled()
  })

  it('Cancel drops the choice without starting', async () => {
    const user = userEvent.setup()
    const { focus, onClearTarget } = renderPanel({ target: TASK })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClearTarget).toHaveBeenCalled()
    expect(focus.start).not.toHaveBeenCalled()
  })

  it('says why when it cannot start, and keeps the choice', async () => {
    const user = userEvent.setup()
    const focus = focusValue({ start: vi.fn().mockReturnValue({ ok: false, reason: 'busy' }) })
    const { onClearTarget } = renderPanel({ focus, target: TASK })
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already running')
    expect(onClearTarget).not.toHaveBeenCalled()
  })
})

describe('a running session', () => {
  it('shows the task, the time left to the second, and Pause and End session', () => {
    renderPanel({ focus: focusValue({ session: session() }) })
    expect(screen.getByRole('heading', { name: 'Focusing on “Write the report”' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('15:00') // 25 minutes planned, 10 passed
    expect(screen.getByRole('status')).toHaveTextContent('Running. 25 minutes session.')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('Pause calls pause', async () => {
    const user = userEvent.setup()
    const { focus } = renderPanel({ focus: focusValue({ session: session() }) })
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(focus.pause).toHaveBeenCalledTimes(1)
  })

  it('ending asks first, says what is kept, and only then ends', async () => {
    const user = userEvent.setup()
    const { focus } = renderPanel({ focus: focusValue({ session: session() }) })
    await user.click(screen.getByRole('button', { name: 'End session' }))
    const dialog = screen.getByRole('dialog', { name: 'End this focus session?' })
    expect(dialog).toHaveTextContent('10 minutes so far')
    expect(dialog).toHaveTextContent('the task is not changed')
    expect(focus.end).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(focus.end).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'End session' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    expect(focus.end).toHaveBeenCalledTimes(1)
  })
})

describe('the countdown', () => {
  afterEach(() => vi.useRealTimers())

  it('redraws itself every second from the clock, and asks for a refresh when the time is up', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0 + 24 * MIN + 55 * 1000) // 5 seconds before the end of a 25 minute session
    const { focus } = renderPanel({ focus: focusValue({ session: session(), now: T0 + 24 * MIN + 55 * 1000 }) })
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('00:05')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('00:03')
    expect(focus.refresh).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(focus.refresh).toHaveBeenCalled() // finished: the page closes the session into the log
  })

  it('does not tick while paused', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0 + 20 * MIN)
    const paused = session({ status: 'paused', segmentStartedAt: null, accumulatedMs: 10 * MIN, pausedAt: T0 + 10 * MIN })
    const { focus } = renderPanel({ focus: focusValue({ session: paused, now: T0 + 20 * MIN }) })
    act(() => { vi.advanceTimersByTime(60 * 1000) })
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('15:00')
    expect(focus.refresh).not.toHaveBeenCalled()
  })
})

describe('a paused session', () => {
  const paused = () => focusValue({ session: session({ status: 'paused', segmentStartedAt: null, accumulatedMs: 10 * MIN, pausedAt: T0 + 10 * MIN }), now: T0 + 5 * 60 * MIN })

  it('keeps the time left where it stopped, says that paused time is not counted, and offers Resume', async () => {
    const user = userEvent.setup()
    const { focus } = renderPanel({ focus: paused() })
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('15:00')
    expect(screen.getByRole('status')).toHaveTextContent('Paused. This time is not counted.')
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(focus.resume).toHaveBeenCalledTimes(1)
  })
})

describe('the summary', () => {
  const record = (over = {}) => ({ id: 's1', taskId: 't1', planDate: '2026-03-10', title: 'Write the report', plannedMs: 25 * MIN, focusedMs: 25 * MIN, outcome: 'completed', startedAt: T0, endedAt: T0 + 25 * MIN, ...over })

  it('a completed session says how long was focused', () => {
    renderPanel({ focus: focusValue({ result: record() }) })
    expect(screen.getByRole('heading', { name: 'Session complete' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You focused for 25 minutes on “Write the report”.')
  })

  it('an early end is told apart, with the real time, and says it still counts', () => {
    renderPanel({ focus: focusValue({ result: record({ outcome: 'ended_early', focusedMs: 12 * MIN }) }) })
    expect(screen.getByRole('heading', { name: 'Session ended early' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You focused for 12 minutes on “Write the report”. That still counts.')
  })

  it('a very short session is not rounded up to a minute', () => {
    renderPanel({ focus: focusValue({ result: record({ outcome: 'ended_early', focusedMs: 10 * 1000 }) }) })
    expect(screen.getByRole('status')).toHaveTextContent('less than a minute')
  })

  it('does not complete the task by itself; “Mark it done” is the person’s choice', async () => {
    const user = userEvent.setup()
    const { onMarkDone, focus } = renderPanel({ focus: focusValue({ result: record() }) })
    expect(onMarkDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Mark it done' }))
    expect(onMarkDone).toHaveBeenCalledWith('t1')
    expect(focus.dismissResult).toHaveBeenCalled()
  })

  it('offers no “Mark it done” when the task is already done or gone, and Close dismisses', async () => {
    const user = userEvent.setup()
    const { focus } = renderPanel({ focus: focusValue({ result: record() }), canMarkDone: () => false })
    expect(screen.queryByRole('button', { name: 'Mark it done' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(focus.dismissResult).toHaveBeenCalled()
  })
})

describe('nothing to show', () => {
  it('shows nothing when there is no session, no choice and no focus time on the day', () => {
    renderPanel()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByText(/Focus time/)).toBeNull()
  })

  it('shows the day’s focus time once there is some', () => {
    const log = [
      { id: 'a', taskId: 't1', planDate: '2026-03-10', focusedMs: 25 * MIN, outcome: 'completed' },
      { id: 'b', taskId: 't2', planDate: '2026-03-10', focusedMs: 15 * MIN, outcome: 'ended_early' },
      { id: 'c', taskId: 't1', planDate: '2026-03-09', focusedMs: 60 * MIN, outcome: 'completed' },
    ]
    renderPanel({ focus: focusValue({ log }) })
    expect(screen.getByLabelText('Focus time on this day')).toHaveTextContent('40 minutes in 2 sessions')
  })

  it('renders nothing without a signed-in person', () => {
    renderPanel({ focus: focusValue({ ready: false }), target: TASK })
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('the tree', () => {
  it('has one short label for its stage and grows with the fraction', () => {
    const labelAt = (fraction) => {
      const { unmount } = render(h(ThemeProvider, { theme }, h(GrowingTree, { fraction })))
      const label = screen.getByRole('img').getAttribute('aria-label')
      unmount()
      return label
    }
    expect(labelAt(0)).toBe('Your tree is a seed.')
    expect(labelAt(0.2)).toBe('Your tree is a sprout.')
    expect(labelAt(0.5)).toBe('Your tree is a sapling.')
    expect(labelAt(0.8)).toBe('Your tree is a young tree.')
    expect(labelAt(1)).toBe('Your tree is a full tree.')
    expect(labelAt(7)).toBe('Your tree is a full tree.') // never grows past full
  })
})
