import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import UndoNotice, { UNDO_NOTICE_MS } from '../../src/components/planner/UndoNotice.jsx'

// Fake timers: the 8 seconds are advanced by the test, never waited for.
const notice = (over = {}) => ({ key: 1, message: '“Walk” marked done.', undoLabel: 'Undo: Walk marked done', ...over })
const renderNotice = (props = {}) => {
  const handlers = { onUndo: vi.fn(), onDismiss: vi.fn() }
  const view = (p) => h(ThemeProvider, { theme }, h(UndoNotice, { notice: notice(), busy: false, error: '', ...handlers, ...p }))
  const result = render(view(props))
  return { ...handlers, rerender: (p) => result.rerender(view(p)) }
}
const pass = (ms) => act(async () => vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('Undo notice: what it shows', () => {
  it('says what was done and offers Undo, as a polite status message', () => {
    renderNotice()
    expect(screen.getByRole('status')).toHaveTextContent('“Walk” marked done.')
    const undo = screen.getByRole('button', { name: 'Undo: Walk marked done' })
    expect(undo).toHaveTextContent('Undo') // the visible word is in the accessible name
    expect(undo).toBeEnabled()
  })

  it('shows nothing without a notice', () => {
    renderNotice({ notice: null })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('presses Undo with the mouse or the keyboard', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onUndo } = renderNotice()
    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    screen.getByRole('button', { name: /^Undo/ }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onUndo).toHaveBeenCalledTimes(3)
  })
})

describe('Undo notice: how long it stays', () => {
  it('is 8 seconds: still there just before, gone just after', async () => {
    expect(UNDO_NOTICE_MS).toBe(8000)
    const { onDismiss } = renderNotice()
    await pass(7900)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeVisible()
    await pass(200)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is held open while the pointer is over it, however long, and gets another 8 seconds after it leaves', async () => {
    const { onDismiss } = renderNotice()
    const alert = screen.getByRole('status')
    await pass(5000)
    fireEvent.mouseEnter(alert.closest('.MuiSnackbar-root'))
    await pass(60000)
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(alert.closest('.MuiSnackbar-root'))
    await pass(7900)
    expect(onDismiss).not.toHaveBeenCalled()
    await pass(200)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is held open while keyboard focus is inside it, and gets another 8 seconds after focus leaves', async () => {
    const { onDismiss } = renderNotice()
    const undo = screen.getByRole('button', { name: /^Undo/ })
    await pass(7000)
    act(() => undo.focus())
    await pass(120000)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeVisible()
    act(() => undo.blur())
    await pass(7900)
    expect(onDismiss).not.toHaveBeenCalled()
    await pass(200)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a newer notice replaces the old one and starts its own 8 seconds', async () => {
    const { onDismiss, rerender } = renderNotice()
    await pass(6000)
    rerender({ notice: notice({ key: 2, message: '“Read” marked done.', undoLabel: 'Undo: Read marked done' }) })
    expect(screen.getByRole('status')).toHaveTextContent('“Read” marked done.')
    await pass(6000) // 12 s since the first, 6 s since the second
    expect(onDismiss).not.toHaveBeenCalled()
    await pass(2100)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('Escape closes it; clicking elsewhere does not', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onDismiss } = renderNotice()
    await user.click(document.body)
    expect(onDismiss).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('Undo notice: while it is working, and when it fails', () => {
  it('disables Undo while the request is in flight, and does not close even when the 8 seconds pass', async () => {
    const { onDismiss, onUndo } = renderNotice({ busy: true })
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeDisabled()
    await pass(30000)
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('shows a failure as an alert in place of the message, offers Try again, and stays open', async () => {
    const { onDismiss, onUndo } = renderNotice({ error: 'We couldn’t reach the server. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t reach the server. Please try again.')
    expect(screen.queryByText('“Walk” marked done.')).toBeNull() // no false success
    await pass(30000)
    expect(onDismiss).not.toHaveBeenCalled()
    const again = screen.getByRole('button', { name: 'Try again' })
    fireEvent.click(again)
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
