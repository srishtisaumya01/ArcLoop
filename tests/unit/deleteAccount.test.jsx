import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'

const mocks = vi.hoisted(() => ({ deleteAccount: vi.fn() }))
vi.mock('../../src/services/authService.js', () => ({ deleteAccount: mocks.deleteAccount }))

const { default: DeleteAccount } = await import('../../src/components/settings/DeleteAccount.jsx')

const open = async (user) => {
  render(h(ThemeProvider, { theme }, h(DeleteAccount)))
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  return screen.getByRole('dialog', { name: 'Delete your account?' })
}

describe('DeleteAccount', () => {
  beforeEach(() => mocks.deleteAccount.mockReset())

  it('says what will be lost and does nothing until opened', () => {
    render(h(ThemeProvider, { theme }, h(DeleteAccount)))
    expect(screen.getByText(/removes your profile, plans, tasks/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('stays disabled until the password is given and the word DELETE is typed exactly', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Your password'), 'pw-1')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'delete')
    expect(confirm).toBeDisabled()
    await user.clear(within(dialog).getByLabelText('Type DELETE to confirm'))
    await user.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE')
    expect(confirm).toBeEnabled()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('sends the password and confirmation, and a refusal is announced without closing the dialog', async () => {
    const user = userEvent.setup()
    mocks.deleteAccount.mockRejectedValueOnce(Object.assign(new Error('Your password is incorrect.'), { code: 'invalid_credentials' }))
    const dialog = await open(user)
    await user.type(within(dialog).getByLabelText('Your password'), 'wrong')
    await user.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE')
    await user.click(within(dialog).getByRole('button', { name: 'Delete everything' }))
    expect(mocks.deleteAccount).toHaveBeenCalledWith({ password: 'wrong', confirmation: 'DELETE' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your password is incorrect.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('"Keep my account" closes the dialog and forgets what was typed', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    await user.type(within(dialog).getByLabelText('Your password'), 'pw-1')
    await user.click(within(dialog).getByRole('button', { name: 'Keep my account' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByLabelText('Your password')).toHaveValue('')
    expect(mocks.deleteAccount).not.toHaveBeenCalled() // backing out deletes nothing
  })
})
