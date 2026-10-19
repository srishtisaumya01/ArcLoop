import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import QuickAddTask from '../../src/components/planner/QuickAddTask.jsx'

function renderQuickAdd({ onAdd = vi.fn().mockResolvedValue({ ok: true }), busy = false } = {}) {
  render(h(ThemeProvider, { theme }, h(QuickAddTask, { busy, onAdd })))
  return { onAdd, input: screen.getByRole('textbox', { name: 'Task' }) }
}

describe('Quick add (My Day)', () => {
  it('is one box and a button: no time, estimate, category, description, priority or repeat fields', () => {
    renderQuickAdd()
    expect(screen.getByRole('form', { name: 'Add a task' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Add a task' })).toBeVisible()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Task' })).toHaveAttribute('placeholder', 'What do you want to do?')
    expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled()
    for (const field of [/start time/i, /end time/i, /estimate/i, /category/i, /description/i, /priority/i, /repeats/i]) expect(screen.queryByLabelText(field)).toBeNull()
  })

  it('adds with Enter, sends only a title in the shape the planner expects, and clears the box for the next task', async () => {
    const user = userEvent.setup()
    const { onAdd, input } = renderQuickAdd()
    await user.type(input, 'Call the dentist{Enter}')
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ title: 'Call the dentist', description: null, category: null, plannedStart: null, plannedEnd: null, estimatedMinutes: null, priorityLevel: 'medium' })
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('adds with the button too', async () => {
    const user = userEvent.setup()
    const { onAdd, input } = renderQuickAdd()
    await user.type(input, 'Read')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read' }))
  })

  it('shows the planner’s own message under the box and keeps what was typed when the title is refused', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn().mockResolvedValue({ ok: false, error: { details: { fields: { title: 'Give the task a title.' } } } })
    const { input } = renderQuickAdd({ onAdd })
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Give the task a title.')).toBeVisible()
    await user.type(input, '   {Enter}')
    expect(input).toHaveValue('   ')
  })

  it('shows a calm message and keeps the text when saving fails, then lets the person try again', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: 'Something went wrong. Please try again.' } }).mockResolvedValueOnce({ ok: true })
    const { input } = renderQuickAdd({ onAdd })
    await user.type(input, 'Stretch{Enter}')
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeVisible()
    expect(input).toHaveValue('Stretch')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(input).toHaveValue(''))
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull()
    expect(onAdd).toHaveBeenCalledTimes(2)
  })

  it('falls back to a plain message when the failure has no text', async () => {
    const user = userEvent.setup()
    const { input } = renderQuickAdd({ onAdd: vi.fn().mockResolvedValue({ ok: false, error: null }) })
    await user.type(input, 'x{Enter}')
    expect(await screen.findByText('We couldn’t add that task. Please try again.')).toBeVisible()
  })

  it('cannot be pressed while a change is saving, and limits the title to 120 characters', () => {
    renderQuickAdd({ busy: true })
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Task' })).toHaveAttribute('maxlength', '120')
  })
})
