import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import TaskRow from '../../src/components/planner/TaskRow.jsx'

const task = (over = {}) => ({
  id: 't1', templateId: null, title: 'Walk', description: null, category: null, isPriority: false, plannedStart: null, plannedEnd: null,
  estimatedMinutes: null, completion: 0, planState: 'active', excludedReason: null, isMinimum: false, ...over,
})

function renderRow({ task: t = task(), canRecord = true, canEdit = true, busy = false, onCompletion = vi.fn().mockResolvedValue({ ok: true }), onEdit = vi.fn().mockResolvedValue({ ok: true }), ...rest } = {}) {
  render(h(ThemeProvider, { theme }, h('ul', null, h(TaskRow, { task: t, canRecord, canEdit, busy, onCompletion, onEdit, onSetAside: vi.fn(), onRestore: vi.fn(), onRemove: vi.fn(), ...rest }))))
  return { onCompletion, onEdit }
}
const box = (title = 'Walk') => screen.getByRole('checkbox', { name: `Done: ${title}` })

describe('TaskRow: one checkbox per task', () => {
  it('shows an unticked checkbox, and no Not done / Partly / Done buttons on the row', () => {
    renderRow()
    expect(box()).not.toBeChecked()
    for (const name of ['Not done', 'Partly', 'Done', /Progress for/]) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByRole('group', { name: /Progress/ })).toBeNull()
  })

  it('ticking completes the task (1), unticking undoes it (0)', async () => {
    const user = userEvent.setup()
    const first = renderRow()
    await user.click(box())
    expect(first.onCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 1)
  })

  it('a done task is ticked and its title is struck through; unticking sends 0', async () => {
    const user = userEvent.setup()
    const { onCompletion } = renderRow({ task: task({ completion: 1 }) })
    expect(box()).toBeChecked()
    expect(screen.getByText('Walk')).toHaveStyle('text-decoration: line-through')
    await user.click(box())
    expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 0)
  })

  it('a partly done task shows a dash (mixed), and one tick finishes it', async () => {
    const user = userEvent.setup()
    const { onCompletion } = renderRow({ task: task({ completion: 0.5 }) })
    expect(box()).toHaveAttribute('data-indeterminate', 'true')
    expect(box()).not.toBeChecked()
    expect(screen.getByText('Walk')).not.toHaveStyle('text-decoration: line-through')
    await user.click(box())
    expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 1)
  })

  it('cannot be ticked when progress cannot be recorded (a future day) or while a change is saving', () => {
    renderRow({ canRecord: false })
    expect(box()).toBeDisabled()
  })

  it('is disabled while busy', () => {
    renderRow({ busy: true })
    expect(box()).toBeDisabled()
  })

  it('a set-aside task has no checkbox', () => {
    renderRow({ task: task({ planState: 'excluded', excludedReason: 'busy_day' }), canRecord: false })
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('Set aside for a busy day')).toBeVisible()
  })

  it('keeps the Minimum label next to the title', () => {
    renderRow({ task: task({ isMinimum: true }) })
    expect(screen.getByText('Minimum')).toBeVisible()
  })
})

describe('TaskRow: Partly lives in Edit', () => {
  async function openEdit(user, t = 'Walk') {
    await user.click(screen.getByRole('button', { name: `Edit ${t}` }))
    return screen.getByRole('form', { name: `Edit ${t}` })
  }

  it('the edit form has a Progress control showing the current state', async () => {
    const user = userEvent.setup()
    renderRow({ task: task({ completion: 0.5 }) })
    const form = await openEdit(user)
    const group = within(form).getByRole('group', { name: 'Progress' })
    expect(within(group).getByRole('button', { name: 'Partly' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Not done' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('choosing Partly and saving goes through the normal completion path, and does not rewrite the details', async () => {
    const user = userEvent.setup()
    const { onCompletion, onEdit } = renderRow()
    const form = await openEdit(user)
    await user.click(within(form).getByRole('button', { name: 'Partly' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 0.5)
    expect(onEdit).not.toHaveBeenCalled() // details unchanged: the task is not marked as customised for nothing
    expect(screen.queryByRole('form', { name: 'Edit Walk' })).toBeNull()
  })

  it('saves changed details first, then the progress', async () => {
    const user = userEvent.setup()
    const order = []
    const onEdit = vi.fn(async () => (order.push('details'), { ok: true }))
    const onCompletion = vi.fn(async () => (order.push('progress'), { ok: true }))
    renderRow({ onEdit, onCompletion })
    const form = await openEdit(user)
    await user.type(within(form).getByLabelText(/Category/), 'Health')
    await user.click(within(form).getByRole('button', { name: 'Done' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(order).toEqual(['details', 'progress'])
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), expect.objectContaining({ category: 'Health' }))
  })

  it('saves details alone when progress was not touched', async () => {
    const user = userEvent.setup()
    const { onCompletion, onEdit } = renderRow({ task: task({ completion: 0.5 }) })
    const form = await openEdit(user)
    await user.type(within(form).getByLabelText(/Category/), 'Home')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onCompletion).not.toHaveBeenCalled()
  })

  it('does not change progress when the details are refused, and shows the planner’s field message', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn().mockResolvedValue({ ok: false, error: { details: { fields: { title: 'Give the task a title.' } } } })
    const { onCompletion } = renderRow({ onEdit })
    const form = await openEdit(user)
    await user.clear(within(form).getByRole('textbox', { name: /^Task/ }))
    await user.click(within(form).getByRole('button', { name: 'Partly' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('Give the task a title.')).toBeVisible()
    expect(onCompletion).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Edit Walk' })).toBeVisible() // stays open
  })

  it('stays open with a calm message if recording the progress fails', async () => {
    const user = userEvent.setup()
    const onCompletion = vi.fn().mockResolvedValue({ ok: false, error: { message: 'That didn’t save. Please try again.' } })
    renderRow({ onCompletion })
    const form = await openEdit(user)
    await user.click(within(form).getByRole('button', { name: 'Done' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('That didn’t save. Please try again.')
    expect(screen.getByRole('form', { name: 'Edit Walk' })).toBeVisible()
  })

  it('has no Progress control where progress cannot be recorded', async () => {
    const user = userEvent.setup()
    renderRow({ canRecord: false })
    const form = await openEdit(user)
    expect(within(form).queryByRole('group', { name: 'Progress' })).toBeNull()
  })

  it('Cancel changes nothing', async () => {
    const user = userEvent.setup()
    const { onCompletion, onEdit } = renderRow()
    const form = await openEdit(user)
    await user.click(within(form).getByRole('button', { name: 'Partly' }))
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(onCompletion).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('TaskRow: My Day planning and focus', () => {
  it('has a Focus button for an open task, which hands the task over without changing it', async () => {
    const user = userEvent.setup()
    const onFocus = vi.fn()
    const { onCompletion, onEdit } = renderRow({ onFocus })
    await user.click(screen.getByRole('button', { name: 'Focus on Walk' }))
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', title: 'Walk' }))
    expect(onCompletion).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('has no Focus button for a done task, a set-aside task, or when focus is not offered', () => {
    const onFocus = vi.fn()
    renderRow({ task: task({ completion: 1 }), onFocus })
    expect(screen.queryByRole('button', { name: /Focus on/ })).toBeNull()
    cleanup()
    renderRow({ task: task({ title: 'Aside', planState: 'excluded', excludedReason: 'busy_day' }), onFocus })
    expect(screen.queryByRole('button', { name: 'Focus on Aside' })).toBeNull()
    cleanup()
    renderRow({ task: task({ title: 'Plain' }) })
    expect(screen.queryByRole('button', { name: 'Focus on Plain' })).toBeNull()
  })

  it('a task being focused on says so and cannot be started again', () => {
    renderRow({ onFocus: vi.fn(), focusing: true })
    expect(screen.getByText('Focusing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Focus on Walk' })).toBeDisabled()
  })

  it('while a session runs on another task, Focus is off for this one and says why', () => {
    renderRow({ onFocus: vi.fn(), focusLocked: true })
    const button = screen.getByRole('button', { name: 'Focus on Walk' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('already running'))
  })

  it('shows the time already focused on the task, once it is at least half a minute', () => {
    renderRow({ onFocus: vi.fn(), focusedMs: 35 * 60 * 1000 })
    expect(screen.getByText(/35 min focused/)).toBeInTheDocument()
    cleanup()
    renderRow({ task: task({ title: 'Brief' }), onFocus: vi.fn(), focusedMs: 10 * 1000 })
    expect(screen.queryByText(/focused/)).toBeNull()
  })

  it('shows Now and Next up on scheduled tasks, next to the title and not instead of anything', () => {
    renderRow({ task: task({ title: 'Report', plannedStart: '09:00', plannedEnd: '11:00' }), marker: 'now' })
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.getByText(/09:00 to 11:00/)).toBeInTheDocument()
    cleanup()
    renderRow({ task: task({ title: 'Gym', plannedStart: '17:00' }), marker: 'next' })
    expect(screen.getByText('Next up')).toBeInTheDocument()
  })

  it('a time is set with the existing Edit form, and saving it changes the time and nothing else', async () => {
    const user = userEvent.setup()
    const { onEdit } = renderRow({ task: task({ title: 'Report', isPriority: true, estimatedMinutes: 60 }) })
    await user.click(screen.getByRole('button', { name: 'Edit Report' }))
    await user.type(screen.getByLabelText(/Start time/), '09:30')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][1]).toMatchObject({ title: 'Report', plannedStart: '09:30', isPriority: true, estimatedMinutes: 60 })
  })
})
