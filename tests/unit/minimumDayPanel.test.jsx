import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import MinimumDayPanel from '../../src/components/planner/MinimumDayPanel.jsx'
import { MINIMUM_DAY_COPY } from '../../src/constants/minimumDayCopy.js'
import { summarizeMinimum } from '../../src/utils/planner/index.js'

const task = (id, over = {}) => ({ id, title: `Task ${id}`, planState: 'active', completion: 0, isMinimum: false, ...over })
const FOUR = [task('a'), task('b'), task('c'), task('d')]

function renderPanel({ occurrences = FOUR, canEdit = true, isToday = true, onSave = vi.fn().mockResolvedValue({ ok: true }), busy = false } = {}) {
  render(h(ThemeProvider, { theme }, h(MinimumDayPanel, { occurrences, minimum: summarizeMinimum(occurrences), canEdit, isToday, busy, onSave })))
  return { onSave, panel: screen.queryByRole('region', { name: 'Minimum Day' }) }
}

describe('Minimum Day panel', () => {
  it('names the feature and describes it with the approved wording', () => {
    const { panel } = renderPanel()
    expect(within(panel).getByRole('heading', { level: 2, name: 'Minimum Day' })).toBeVisible()
    expect(panel).toHaveTextContent('Choose a few important tasks to keep your day moving.')
    expect(panel).toHaveTextContent(MINIMUM_DAY_COPY.noneChosen)
  })

  it('lets the person choose up to 3 and blocks a fourth, saving exactly the chosen tasks', async () => {
    const user = userEvent.setup()
    const { onSave, panel } = renderPanel()
    await user.click(within(panel).getByRole('button', { name: 'Choose your minimum' }))
    const boxes = within(panel).getAllByRole('checkbox')
    expect(boxes).toHaveLength(4)
    await user.click(boxes[0])
    await user.click(boxes[1])
    await user.click(boxes[2])
    expect(within(panel).getByText('3 of 3 chosen')).toBeVisible()
    expect(boxes[3]).toBeDisabled() // a fourth cannot be picked
    expect(boxes[0]).toBeEnabled() // but a chosen one can still be unticked
    await user.click(within(panel).getByRole('button', { name: 'Save minimum' }))
    expect(onSave).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('cannot save an empty choice and can cancel without saving', async () => {
    const user = userEvent.setup()
    const { onSave, panel } = renderPanel()
    await user.click(within(panel).getByRole('button', { name: 'Choose your minimum' }))
    expect(within(panel).getByRole('button', { name: 'Save minimum' })).toBeDisabled()
    await user.click(within(panel).getByRole('button', { name: 'Cancel' }))
    expect(within(panel).getByRole('button', { name: 'Choose your minimum' })).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows the chosen tasks, their state, and the incomplete wording without any failure language', () => {
    const { panel } = renderPanel({ occurrences: [task('a', { isMinimum: true, completion: 0.5 }), task('b', { isMinimum: true }), task('c')] })
    const list = within(panel).getByRole('list', { name: 'Your minimum tasks' })
    expect(list).toHaveTextContent('Task a · Partly done')
    expect(list).toHaveTextContent('Task b · Not done')
    expect(within(panel).getByRole('status')).toHaveTextContent('Your minimum is still here whenever you’re ready.')
    expect(panel.textContent).not.toMatch(/fail|miss|broke|lost|behind|streak/i)
  })

  it('shows the completion wording when every chosen task is done', () => {
    const { panel } = renderPanel({ occurrences: [task('a', { isMinimum: true, completion: 1 }), task('b', { isMinimum: true, completion: 1 }), task('c')] })
    expect(within(panel).getByRole('status')).toHaveTextContent('You showed up for yourself today.')
    expect(panel).toHaveTextContent('2 of 2 done')
  })

  it('keeps the completion wording to today only', () => {
    const { panel } = renderPanel({ occurrences: [task('a', { isMinimum: true, completion: 1 })], isToday: false })
    expect(within(panel).queryByRole('status')).toBeNull()
    expect(panel).toHaveTextContent('1 of 1 done')
  })

  it('clears the minimum with an empty list', async () => {
    const user = userEvent.setup()
    const { onSave, panel } = renderPanel({ occurrences: [task('a', { isMinimum: true }), task('b')] })
    await user.click(within(panel).getByRole('button', { name: 'Clear minimum' }))
    expect(onSave).toHaveBeenCalledWith([])
  })

  it('starts from the current choice when changing it', async () => {
    const user = userEvent.setup()
    const { onSave, panel } = renderPanel({ occurrences: [task('a', { isMinimum: true }), task('b'), task('c')] })
    await user.click(within(panel).getByRole('button', { name: 'Change minimum' }))
    const [a, b] = within(panel).getAllByRole('checkbox')
    expect(a).toBeChecked()
    await user.click(a)
    await user.click(b)
    await user.click(within(panel).getByRole('button', { name: 'Save minimum' }))
    expect(onSave).toHaveBeenCalledWith(['b'])
  })

  it('does not offer set-aside tasks as choices', async () => {
    const user = userEvent.setup()
    const { panel } = renderPanel({ occurrences: [task('a'), task('b', { planState: 'excluded' })] })
    await user.click(within(panel).getByRole('button', { name: 'Choose your minimum' }))
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(1)
  })

  it('says what to do when the day has no tasks', () => {
    const { panel } = renderPanel({ occurrences: [] })
    expect(panel).toHaveTextContent(MINIMUM_DAY_COPY.noTasks)
    expect(within(panel).queryByRole('button')).toBeNull()
  })

  it('shows a calm message and stays open when saving fails, then allows trying again', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: 'Choose up to 3 tasks for your minimum.' } }).mockResolvedValueOnce({ ok: true })
    const { panel } = renderPanel({ onSave })
    await user.click(within(panel).getByRole('button', { name: 'Choose your minimum' }))
    await user.click(within(panel).getAllByRole('checkbox')[0])
    await user.click(within(panel).getByRole('button', { name: 'Save minimum' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Choose up to 3 tasks for your minimum.')
    await user.click(within(panel).getByRole('button', { name: 'Save minimum' }))
    await waitFor(() => expect(within(panel).queryByRole('alert')).toBeNull())
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('is read-only on history: nothing to show without a minimum, a record without controls with one', () => {
    expect(renderPanel({ canEdit: false }).panel).toBeNull()
  })

  it('shows a recorded minimum on a read-only day without controls', () => {
    const { panel } = renderPanel({ canEdit: false, isToday: false, occurrences: [task('a', { isMinimum: true, completion: 1 })] })
    expect(panel).toHaveTextContent('Task a · Done')
    expect(within(panel).queryByRole('button')).toBeNull()
  })

  it('disables the controls while a change is saving', () => {
    const { panel } = renderPanel({ busy: true })
    expect(within(panel).getByRole('button', { name: 'Choose your minimum' })).toBeDisabled()
  })
})
