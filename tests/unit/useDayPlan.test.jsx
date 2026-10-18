import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({ getToday: null, openDay: null, getDayPlan: null }))
vi.mock('../../src/services/planner/index.js', () => ({ plannerService: service }))

const { useDayPlan } = await import('../../src/hooks/useDayPlan.js')

const plan = (planDate) => ({ planDate, exists: true, occurrences: [], expected: [], moves: [], summary: null, access: 'today' })

describe('useDayPlan', () => {
  it('a change that finishes after the person moved to another day does not replace that day, which would leave it loading forever', async () => {
    service.getToday = vi.fn(async () => ({ today: '2026-03-10' }))
    service.openDay = vi.fn(async (date) => plan(date))
    service.getDayPlan = vi.fn(async (date) => plan(date))

    const { result, rerender } = renderHook(({ date }) => useDayPlan(date), { initialProps: { date: '2026-03-11' } })
    await waitFor(() => expect(result.current.status).toBe('success'))

    // "Start this day" on Wednesday: slow, so it is still running when the person goes back to Tuesday.
    let release
    const slow = new Promise((resolve) => {
      release = resolve
    })
    let finished
    act(() => {
      finished = result.current.run(() => slow, { open: true })
    })
    rerender({ date: '2026-03-10' })
    await waitFor(() => expect(result.current.data?.planDate).toBe('2026-03-10'))

    await act(async () => {
      release()
      await finished
    })
    expect(result.current.status).toBe('success')
    expect(result.current.data.planDate).toBe('2026-03-10') // still Tuesday's plan, not loading and not Wednesday's
    expect(result.current.busy).toBe(false)
  })

  it('a change on the day that is still shown refreshes it as before', async () => {
    let completed = 0
    service.getToday = vi.fn(async () => ({ today: '2026-03-10' }))
    service.openDay = vi.fn(async (date) => ({ ...plan(date), completed }))
    const { result } = renderHook(() => useDayPlan('2026-03-10'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    await act(async () => {
      await result.current.run(async () => {
        completed = 1
      })
    })
    expect(result.current.data.completed).toBe(1)
  })
})
