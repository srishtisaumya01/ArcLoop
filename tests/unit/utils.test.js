import { describe, it, expect } from 'vitest'
import { ALL, filterChallenges, hasActiveFilters } from '../../src/utils/challengeFilters.js'
import { validateEmail, validateNewPassword, validateRequired } from '../../src/utils/validation.js'
import { DEMO_CHALLENGES } from '../../src/constants/demoChallenges.js'

describe('filterChallenges', () => {
  it('returns everything with no filters', () => {
    expect(filterChallenges(DEMO_CHALLENGES)).toHaveLength(DEMO_CHALLENGES.length)
  })
  it('searches title, case-insensitively', () => {
    const r = filterChallenges(DEMO_CHALLENGES, { query: '  WINTER ' })
    expect(r.map((c) => c.slug)).toEqual(['winter-arc-90'])
  })
  it('filters by category and visibility', () => {
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'Fitness' }).every((c) => c.category === 'Fitness')).toBe(true)
    const invite = filterChallenges(DEMO_CHALLENGES, { visibility: 'invite-only' })
    expect(invite.length).toBeGreaterThan(0)
    expect(invite.every((c) => c.visibility === 'invite-only')).toBe(true)
  })
  it('returns an empty list when nothing matches', () => {
    expect(filterChallenges(DEMO_CHALLENGES, { query: 'zzzz' })).toEqual([])
  })
  it('detects active filters', () => {
    expect(hasActiveFilters({ query: '', category: ALL, visibility: ALL })).toBe(false)
    expect(hasActiveFilters({ query: ' x ' })).toBe(true)
    expect(hasActiveFilters({ category: 'Fitness' })).toBe(true)
  })
})

describe('demo data', () => {
  it('has unique slugs and exactly one featured challenge', () => {
    expect(new Set(DEMO_CHALLENGES.map((c) => c.slug)).size).toBe(DEMO_CHALLENGES.length)
    expect(DEMO_CHALLENGES.filter((c) => c.featured)).toHaveLength(1)
  })
})

describe('validation', () => {
  it('validates email', () => {
    expect(validateEmail('')).toMatch(/enter your email/i)
    expect(validateEmail('nope')).toMatch(/valid email/i)
    expect(validateEmail('a@b')).toMatch(/valid email/i)
    expect(validateEmail(' name@example.com ')).toBeUndefined()
  })
  it('validates new passwords', () => {
    expect(validateNewPassword('')).toBeTruthy()
    expect(validateNewPassword('short')).toMatch(/at least 8/)
    expect(validateNewPassword('longenough')).toBeUndefined()
  })
  it('validates required text', () => {
    expect(validateRequired('   ', 'Required.')).toBe('Required.')
    expect(validateRequired('ok', 'Required.')).toBeUndefined()
  })
})
