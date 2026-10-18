import { describe, expect, it } from 'vitest'
import ICAL from 'ical.js'
import { CRLF, contentLine, escapeText, foldLine, formatDate, formatUtc, serialize } from '../../../src/utils/calendar/icsText.js'

const octets = (text) => new TextEncoder().encode(text).length
const unfold = (text) => text.replaceAll(`${CRLF} `, '')

describe('escapeText (RFC 5545 TEXT)', () => {
  it('escapes backslash, semicolon, comma and line breaks, in that order of safety', () => {
    expect(escapeText('a\\b')).toBe('a\\\\b')
    expect(escapeText('a;b,c')).toBe('a\\;b\\,c')
    expect(escapeText('line1\nline2\r\nline3\rline4')).toBe('line1\\nline2\\nline3\\nline4')
    expect(escapeText('\\n is not a newline')).toBe('\\\\n is not a newline') // a literal backslash-n stays literal
  })

  it('drops control characters a calendar file cannot carry, keeps ordinary text, tabs and unicode', () => {
    expect(escapeText('a\u0000b\u0007c\u001Fd\u007Fe')).toBe('abcde')
    expect(escapeText('tab\there')).toBe('tab\there')
    expect(escapeText('café 日本語 😀')).toBe('café 日本語 😀')
  })

  it('treats null, undefined and numbers as text instead of throwing', () => {
    expect(escapeText(null)).toBe('')
    expect(escapeText(undefined)).toBe('')
    expect(escapeText(42)).toBe('42')
  })
})

describe('foldLine (75 octets)', () => {
  it('leaves a line of up to 75 octets alone and folds one of 76', () => {
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75))
    expect(foldLine('x'.repeat(76)).split(CRLF)).toHaveLength(2)
  })

  it('never produces a physical line over 75 octets and loses nothing', () => {
    for (const length of [76, 150, 151, 500]) {
      const original = `DESCRIPTION:${'abcdefghij'.repeat(Math.ceil(length / 10))}`.slice(0, length)
      const folded = foldLine(original)
      for (const line of folded.split(CRLF)) expect(octets(line), `${length}`).toBeLessThanOrEqual(75)
      expect(unfold(folded)).toBe(original)
    }
  })

  it('counts bytes, not characters, and never splits a multi-byte character or an emoji', () => {
    const original = `SUMMARY:${'é日😀'.repeat(60)}`
    const folded = foldLine(original)
    for (const line of folded.split(CRLF)) {
      expect(octets(line)).toBeLessThanOrEqual(75)
      expect(line).not.toMatch(/�/) // no half character
    }
    expect(unfold(folded)).toBe(original)
    expect([...unfold(folded)].every((char) => char.length > 0)).toBe(true)
  })

  it('an independent parser reads a folded long value back exactly', () => {
    const description = `${'Long description, with; punctuation and 日本語 😀. '.repeat(12)}end`
    const file = serialize(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:x', 'BEGIN:VEVENT', 'UID:u@x', 'DTSTAMP:20260310T150000Z', 'DTSTART:20260310T130000Z', contentLine('DESCRIPTION', escapeText(description)), 'END:VEVENT', 'END:VCALENDAR'])
    const read = new ICAL.Component(ICAL.parse(file)).getFirstSubcomponent('vevent').getFirstPropertyValue('description')
    expect(read).toBe(description)
  })
})

describe('formats and serialisation', () => {
  it('writes UTC date-times and dates in the iCalendar form', () => {
    expect(formatUtc(Date.UTC(2026, 2, 10, 13, 5, 9))).toBe('20260310T130509Z')
    expect(formatUtc(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe('20261231T235959Z')
    expect(formatUtc(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('20260101T000000Z')
    expect(formatDate('2026-03-10')).toBe('20260310')
  })

  it('builds content lines with parameters', () => {
    expect(contentLine('SUMMARY', 'Walk')).toBe('SUMMARY:Walk')
    expect(contentLine('DTSTART', '20260310', { VALUE: 'DATE' })).toBe('DTSTART;VALUE=DATE:20260310')
  })

  it('ends every line, the last included, with CRLF and never uses a bare line feed', () => {
    const text = serialize(['A:1', `B:${'x'.repeat(200)}`, 'C:3'])
    expect(text.endsWith(CRLF)).toBe(true)
    expect(text.replaceAll(CRLF, '')).not.toMatch(/[\r\n]/)
    for (const line of text.split(CRLF).slice(0, -1)) expect(octets(line)).toBeLessThanOrEqual(75)
  })
})
