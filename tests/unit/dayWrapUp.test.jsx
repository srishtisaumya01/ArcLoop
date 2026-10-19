import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import DayWrapUp from '../../src/components/planner/DayWrapUp.jsx'

// The wrap-up panel: it opens when asked, shows what happened, and carries only what the person has ticked. It never moves anything by itself.
const task = (id, over = {}) => ({ id, title: id, templateId: null, completion: 0, planState: 'active', ...over })
const day = [task('Read', { completion: 1 }), task('Walk', { completion: 0.5, templateId: 'tpl-once' }), task('Call mum'), task('Gym', { templateId: 'tpl-1' }), task('Old thing', { planState: 'excluded' })] // Walk was made once, so it has a template of its own

function renderWrapUp(over = {}) {
  const props = { occurrences: day, focusMs: 0, sessions: 0, tomorrowLabel: 'Wednesday 11 Mar', busy: false, onCarry: vi.fn().mockResolvedValue({ ok: true }), notice: null, getRepeatingIds: vi.fn().mockResolvedValue(new Set(['tpl-1'])), ...over }
  render(h(ThemeProvider, { theme }, h(DayWrapUp, props)))
  return props
}
const open = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Look back on the day' }))
  await waitFor(() => expect(screen.queryByText(/One moment/)).toBeNull()) // the panel asks which tasks repeat, then shows them
}

describe('DayWrapUp', () => {
  it('starts closed: a button, not a pop-up, and nothing is shown until it is pressed', async () => {
    const user = userEvent.setup()
    renderWrapUp()
    const button = screen.getByRole('button', { name: 'Look back on the day' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Done today' })).toBeNull()
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Hide the wrap-up' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Done today' })).toBeInTheDocument()
  })

  it('shows what was done, what is partly done, and the open tasks', async () => {
    const user = userEvent.setup()
    renderWrapUp()
    await open(user)
    const done = screen.getByRole('region', { name: 'Done today' })
    expect(within(done).getByText('Done today (1)')).toBeInTheDocument()
    expect(within(done).getByText('Read')).toBeInTheDocument()
    expect(within(done).getByText('1 more is partly done. Partly done counts.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Still open' })).getByText('Still open (3)')).toBeInTheDocument()
    expect(screen.queryByText('Old thing')).toBeNull() // set aside: not part of the day's plan
  })

  it('says it is fine when nothing is done yet, and when nothing is left open', async () => {
    const user = userEvent.setup()
    renderWrapUp({ occurrences: [task('a')] })
    await open(user)
    expect(screen.getByText('Nothing is ticked off yet. That is fine.')).toBeInTheDocument()
    cleanupAndRender([task('a', { completion: 1 })])
    await open(userEvent.setup())
    expect(screen.getByText('Nothing is left open.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carry/ })).toBeNull()
  })

  it('shows the focus time, with where it is kept, or that none was recorded', async () => {
    const user = userEvent.setup()
    renderWrapUp({ focusMs: 50 * 60 * 1000, sessions: 2 })
    await open(user)
    expect(screen.getByRole('region', { name: 'Focus time today' })).toHaveTextContent('50 min in 2 sessions (kept in this browser).')
    cleanupAndRender(day, { focusMs: 0, sessions: 0 })
    await open(userEvent.setup())
    expect(screen.getByRole('region', { name: 'Focus time today' })).toHaveTextContent('No focus sessions were recorded in this browser today.')
  })

  it('lists the open one-off tasks ticked, each by name, and keeps a repeating task out of the choice', async () => {
    const user = userEvent.setup()
    renderWrapUp()
    await open(user)
    const group = screen.getByRole('group', { name: 'Carry to Wednesday 11 Mar' })
    expect(within(group).getByRole('checkbox', { name: 'Walk (partly done)' })).toBeChecked()
    expect(within(group).getByRole('checkbox', { name: 'Call mum' })).toBeChecked()
    expect(within(group).queryByRole('checkbox', { name: /Gym/ })).toBeNull()
    expect(screen.getByText('These repeat anyway, so they will be on their own days: Gym.')).toBeInTheDocument()
  })

  it('carries exactly the ticked tasks when the button is pressed, and not before', async () => {
    const user = userEvent.setup()
    const { onCarry } = renderWrapUp()
    await open(user)
    expect(onCarry).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: 'Call mum' })) // untick one
    const button = screen.getByRole('button', { name: 'Carry 1 to Wednesday 11 Mar' })
    await user.click(button)
    expect(onCarry).toHaveBeenCalledTimes(1)
    expect(onCarry).toHaveBeenCalledWith(['Walk'])
  })

  it('carries everything by default, and offers nothing to press when everything is unticked', async () => {
    const user = userEvent.setup()
    const { onCarry } = renderWrapUp()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' }))
    expect(onCarry).toHaveBeenCalledWith(['Walk', 'Call mum'])
    await user.click(screen.getByRole('checkbox', { name: 'Walk (partly done)' }))
    await user.click(screen.getByRole('checkbox', { name: 'Call mum' }))
    expect(screen.getByRole('button', { name: 'Choose what to carry' })).toBeDisabled()
  })

  it('is off while a change is being saved', async () => {
    const user = userEvent.setup()
    renderWrapUp({ busy: true })
    await open(user)
    expect(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Call mum' })).toBeDisabled()
  })

  it('shows the words about the last carry-over, politely, even when closed, and Close hides the panel', async () => {
    const user = userEvent.setup()
    renderWrapUp({ notice: '2 tasks moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.' })
    expect(screen.getByRole('status')).toHaveTextContent('2 tasks moved to Wednesday 11 Mar.')
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Done today' })).toBeNull()
  })

  it('does not blame: the wording is about what carries over, not what was missed', async () => {
    const user = userEvent.setup()
    renderWrapUp()
    await open(user)
    const text = document.body.textContent
    expect(text).toContain('A task that did not happen today is just a task.')
    expect(text).not.toMatch(/failed|overdue|late|behind|should have|lazy/i)
  })
})

function cleanupAndRender(occurrences, extra = {}) {
  document.body.innerHTML = ''
  renderWrapUp({ occurrences, ...extra })
}

describe('DayWrapUp: which tasks repeat', () => {
  it('asks once, when first opened, and shows a moment of waiting until it knows', async () => {
    const user = userEvent.setup()
    let release
    const getRepeatingIds = vi.fn(() => new Promise((resolve) => { release = () => resolve(new Set(['tpl-1'])) }))
    renderWrapUp({ getRepeatingIds })
    expect(getRepeatingIds).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Look back on the day' }))
    expect(screen.getByText('One moment, looking at which tasks repeat…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carry \d/ })).toBeNull()
    release()
    await screen.findByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Look back on the day' }))
    expect(getRepeatingIds).toHaveBeenCalledTimes(1)
  })

  it('offers every open task if the templates cannot be read', async () => {
    const user = userEvent.setup()
    renderWrapUp({ getRepeatingIds: vi.fn().mockRejectedValue(new Error('offline')) })
    await open(user)
    expect(screen.getByRole('button', { name: 'Carry 3 to Wednesday 11 Mar' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Gym' })).toBeChecked()
  })

  it('a task made once is carried over even though it has a template', async () => {
    const user = userEvent.setup()
    const { onCarry } = renderWrapUp()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' }))
    expect(onCarry).toHaveBeenCalledWith(['Walk', 'Call mum'])
  })
})
