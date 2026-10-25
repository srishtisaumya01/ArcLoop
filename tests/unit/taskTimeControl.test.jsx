import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import TaskTimeControl from '../../src/components/planner/TaskTimeControl.jsx'

// The quick time control: set, change and remove a time, and the two shift buttons that replace dragging. It only sends times; the planner
// validates them and its message is shown.
const task = (over = {}) => ({ id: 't1', title: 'Gym', plannedStart: null, plannedEnd: null, ...over })
function renderControl({ t = task(), onSave = vi.fn().mockResolvedValue({ ok: true }), onClose = vi.fn(), busy = false } = {}) {
  render(h(ThemeProvider, { theme }, h(TaskTimeControl, { task: t, busy, onSave, onClose })))
  return { onSave, onClose }
}
const form = () => screen.getByRole('form', { name: 'Time for Gym' })

describe('a task with no time', () => {
  it('offers the two pickers and no shift buttons, and saves a start time', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderControl()
    expect(screen.queryByRole('button', { name: /minutes earlier|minutes later/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove the time' })).toBeNull()
    await user.type(screen.getByLabelText('Start time'), '09:30')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(onSave).toHaveBeenCalledWith({ plannedStart: '09:30', plannedEnd: null })
    expect(onClose).toHaveBeenCalled()
  })

  it('saves a start and an end time', async () => {
    const user = userEvent.setup()
    const { onSave } = renderControl()
    await user.type(screen.getByLabelText('Start time'), '09:30')
    await user.type(screen.getByLabelText('End time (optional)'), '10:15')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(onSave).toHaveBeenCalledWith({ plannedStart: '09:30', plannedEnd: '10:15' })
  })
})

describe('a task with a time', () => {
  const scheduled = () => task({ plannedStart: '09:00', plannedEnd: '10:00' })

  it('starts from the saved times', () => {
    renderControl({ t: scheduled() })
    expect(screen.getByLabelText('Start time')).toHaveValue('09:00')
    expect(screen.getByLabelText('End time (optional)')).toHaveValue('10:00')
  })

  it('moves the whole block 15 minutes earlier or later with one tap, and stays open for another', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderControl({ t: scheduled() })
    await user.click(screen.getByRole('button', { name: 'Move Gym 15 minutes later' }))
    expect(onSave).toHaveBeenLastCalledWith({ plannedStart: '09:15', plannedEnd: '10:15' })
    await user.click(screen.getByRole('button', { name: 'Move Gym 15 minutes earlier' }))
    expect(onSave).toHaveBeenLastCalledWith({ plannedStart: '08:45', plannedEnd: '09:45' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shifts a start-only task too', async () => {
    const user = userEvent.setup()
    const { onSave } = renderControl({ t: task({ plannedStart: '09:00' }) })
    await user.click(screen.getByRole('button', { name: 'Move Gym 15 minutes later' }))
    expect(onSave).toHaveBeenCalledWith({ plannedStart: '09:15', plannedEnd: null })
  })

  it('will not shift a block out of the day', () => {
    renderControl({ t: task({ plannedStart: '00:10', plannedEnd: '00:40' }) })
    expect(screen.getByRole('button', { name: 'Move Gym 15 minutes earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Gym 15 minutes later' })).toBeEnabled()
  })

  it('will not shift an end time past the last minute of the day', () => {
    renderControl({ t: task({ plannedStart: '23:00', plannedEnd: '23:50' }) })
    expect(screen.getByRole('button', { name: 'Move Gym 15 minutes later' })).toBeDisabled()
  })

  it('removes the time', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderControl({ t: scheduled() })
    await user.click(screen.getByRole('button', { name: 'Remove the time' }))
    expect(onSave).toHaveBeenCalledWith({ plannedStart: null, plannedEnd: null })
    expect(onClose).toHaveBeenCalled()
  })

  it('Close leaves without saving', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderControl({ t: scheduled() })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('when the planner refuses', () => {
  it('shows its message for the time and stays open', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: { message: 'Please check the highlighted details.', details: { fields: { plannedEnd: 'The end time needs to be after the start time.' } } } })
    const { onClose } = renderControl({ onSave })
    await user.type(screen.getByLabelText('Start time'), '10:00')
    await user.type(screen.getByLabelText('End time (optional)'), '09:00')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The end time needs to be after the start time.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a general message for a failed request, and clears it on the next try', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: 'Failed to fetch' } }).mockResolvedValueOnce({ ok: true })
    renderControl({ onSave })
    await user.type(screen.getByLabelText('Start time'), '10:00')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('is off while the page is busy', () => {
    renderControl({ t: task({ plannedStart: '09:00' }), busy: true })
    expect(screen.getByRole('button', { name: 'Save time' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Gym 15 minutes later' })).toBeDisabled()
    expect(form()).toBeInTheDocument()
  })
})
