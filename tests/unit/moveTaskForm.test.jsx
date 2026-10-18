import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import MoveTaskForm from '../../src/components/planner/MoveTaskForm.jsx'
import { editableRange } from '../../src/utils/planner/index.js'

// Tuesday 2026-03-10 is "today": the editing range is Wednesday 4 March to Thursday 9 April (the last 7 days, then 30 ahead).
const RANGE = editableRange('2026-03-10')
const task = (planDate = '2026-03-10') => ({ id: 't1', title: 'Walk', planDate })
function renderForm({ planDate, onMove = vi.fn().mockResolvedValue({ ok: true }), range = RANGE } = {}) {
  const onCancel = vi.fn()
  render(h(ThemeProvider, { theme }, h(MoveTaskForm, { task: task(planDate), busy: false, onMove, onCancel, range })))
  return { onMove, onCancel, date: screen.getByLabelText('Move to') }
}

describe('Move: the date field follows the planner’s own range', () => {
  it('offers only days from 6 days ago to 30 days ahead (the planner re-checks the day when the move is made)', () => {
    expect(RANGE).toEqual({ earliest: '2026-03-04', latest: '2026-04-09' })
    const { date } = renderForm()
    expect(date).toHaveAttribute('min', '2026-03-04')
    expect(date).toHaveAttribute('max', '2026-04-09')
  })

  it('starts on the next day, which is inside the range', () => {
    expect(renderForm().date).toHaveValue('2026-03-11')
  })

  it('starts inside the range even for a task on the last day it can be moved to', () => {
    const { date } = renderForm({ planDate: '2026-04-09' })
    expect(date).toHaveValue('2026-03-04') // the next day would be past the limit
  })

  it('has no limits when none are given, as before', () => {
    const { date } = renderForm({ range: null })
    expect(date).not.toHaveAttribute('min')
    expect(date).not.toHaveAttribute('max')
  })

  it('moves to the chosen day and closes, and shows the planner’s message and stays open when refused', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    expect(first.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), '2026-03-11')
    expect(first.onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the form open with the planner’s message when the move is refused', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn().mockResolvedValue({ ok: false, error: { message: 'This task is already planned for that day.' } })
    const { onCancel } = renderForm({ onMove })
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    expect(await screen.findByText('This task is already planned for that day.')).toBeVisible()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
