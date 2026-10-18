import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './renderRoute.jsx'
import { ALL_FAQS, FAQ_GROUPS } from '../../src/constants/faqContent.js'

describe('FAQ page', () => {
  it('has its own page with every question, grouped by topic', async () => {
    renderAt('/faq')
    await screen.findByRole('heading', { level: 1, name: 'Frequently asked questions' })
    const main = within(screen.getByRole('main'))
    expect(main.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(FAQ_GROUPS.map((g) => g.title))
    expect(main.getAllByRole('heading', { level: 3 }).length).toBe(ALL_FAQS.length)
    expect(screen.getByText(`Showing ${ALL_FAQS.length} questions`)).toBeInTheDocument()
  })

  it('filters the questions as you type and offers a way back from an empty search', async () => {
    const user = userEvent.setup()
    renderAt('/faq')
    await user.type(await screen.findByLabelText('Search questions'), 'dark theme')
    expect(await screen.findByText('Showing 1 questions')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Hindi, or with a dark theme/ })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search questions'))
    await user.type(screen.getByLabelText('Search questions'), 'zzzzzz')
    expect(await screen.findByRole('heading', { name: 'No questions match your search' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByText(`Showing ${ALL_FAQS.length} questions`)).toBeInTheDocument()
  })

  it('points to the contact page for anything it does not answer', async () => {
    renderAt('/faq')
    const card = (await screen.findByText('Still have a question?')).closest('div')
    expect(within(card.parentElement.parentElement).getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/contact')
  })

  it('is the target of the FAQ links in the navigation and footer', async () => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
    const footerNav = screen.getByRole('navigation', { name: 'Product' })
    expect(within(footerNav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
  })
})
