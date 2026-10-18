import { describe, it, expect } from 'vitest'
import { firstNameOf, greetingFor, initialsOf, nameFor } from '../../src/utils/greeting.js'

const at = (h, m = 0) => new Date(2026, 9, 18, h, m, 0)

describe('greetingFor', () => {
  it('says good morning from 5:00 to 11:59', () => {
    expect(greetingFor(at(5, 0))).toBe('Good morning')
    expect(greetingFor(at(11, 59))).toBe('Good morning')
  })
  it('says good afternoon from 12:00 to 16:59', () => {
    expect(greetingFor(at(12, 0))).toBe('Good afternoon')
    expect(greetingFor(at(16, 59))).toBe('Good afternoon')
  })
  it('says good evening from 17:00 through the night', () => {
    expect(greetingFor(at(17, 0))).toBe('Good evening')
    expect(greetingFor(at(23, 30))).toBe('Good evening')
    expect(greetingFor(at(0, 15))).toBe('Good evening')
    expect(greetingFor(at(4, 59))).toBe('Good evening')
  })
})

describe('names', () => {
  it('prefers the display name', () => {
    expect(nameFor({ displayName: '  Keshav Jha ', email: 'x@y.com' })).toBe('Keshav Jha')
  })
  it('falls back to a tidy version of the email name', () => {
    expect(nameFor({ displayName: null, email: 'ada.lovelace@example.com' })).toBe('Ada Lovelace')
    expect(nameFor({ displayName: '', email: 'neon_smoke-1@example.com' })).toBe('Neon Smoke 1')
    expect(nameFor({})).toBe('')
  })
  it('gives a first name and initials', () => {
    expect(firstNameOf('Keshav Kumar Jha')).toBe('Keshav')
    expect(initialsOf('Keshav Kumar Jha')).toBe('KJ')
    expect(initialsOf('ada')).toBe('A')
    expect(initialsOf('')).toBe('?')
  })
})
