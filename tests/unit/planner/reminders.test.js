import { describe, expect, it } from 'vitest'
import {
  REMINDER_GRACE_MINUTES,
  dailyReminderDue,
  dailyReminderText,
  dueTaskReminders,
  nextDailyReminder,
  reminderInstant,
  taskReminderText,
  upcomingTaskReminders,
  validateReminderPreferences,
  validateReminderTime,
} from '../../../src/utils/planner/index.js'

const NY = 'America/New_York'
const prefs = (over = {}) => ({ enabled: true, remindTime: '09:00', weekdays: [1, 2, 3, 4, 5, 6, 7], lastNotifiedOn: '1970-01-01', ...over })
// 2026-03-10 is a Tuesday; New York is on EDT (UTC-4), so 09:00 local = 13:00Z.
const AT = (iso) => iso

describe('reminder preferences validation', () => {
  it('accepts valid settings and normalises the weekdays', () => {
    const r = validateReminderPreferences({ enabled: true, remindTime: '07:05', weekdays: [5, 1, 1, 3] })
    expect(r).toEqual({ ok: true, value: { enabled: true, remindTime: '07:05', weekdays: [1, 3, 5] }, errors: {} })
  })

  it('rejects bad times, empty or out-of-range days and a non-boolean switch', () => {
    for (const remindTime of ['9:00', '24:00', '09:60', '09:00:30', '', null, 900]) {
      expect(validateReminderPreferences({ enabled: true, remindTime, weekdays: [1] }).errors.remindTime).toBeTruthy()
    }
    for (const weekdays of [[], [0], [8], [1.5], 'mon', null]) {
      expect(validateReminderPreferences({ enabled: true, remindTime: '09:00', weekdays }).errors.weekdays).toBeTruthy()
    }
    expect(validateReminderPreferences({ enabled: 'yes', remindTime: '09:00', weekdays: [1] }).errors.enabled).toBeTruthy()
    expect(validateReminderPreferences(undefined).ok).toBe(false)
  })

  it('validates a single reminder time', () => {
    expect(validateReminderTime('18:30').ok).toBe(true)
    expect(validateReminderTime('6pm').errors.remindTime).toBeTruthy()
  })
})

describe('daily reminder timing (local time, local weekday, once per day)', () => {
  it('is due from the chosen local time until the delivery window closes', () => {
    const due = (now, over) => dailyReminderDue({ prefs: prefs(over), now: AT(now), timeZone: NY }).due
    expect(due('2026-03-10T12:59:00Z')).toBe(false) // 08:59 local
    expect(due('2026-03-10T13:00:00Z')).toBe(true) // 09:00 local
    const closes = Date.parse('2026-03-10T13:00:00Z') + REMINDER_GRACE_MINUTES * 60000
    expect(due(closes - 1)).toBe(true)
    expect(due(closes)).toBe(false) // opening the app much later does not replay it
  })

  it('is never due when reminders are off, and reports no date problem', () => {
    expect(dailyReminderDue({ prefs: prefs({ enabled: false }), now: '2026-03-10T13:05:00Z', timeZone: NY }).due).toBe(false)
    expect(dailyReminderDue({ prefs: null, now: '2026-03-10T13:05:00Z', timeZone: NY }).due).toBe(false)
  })

  it('respects the chosen weekdays using the LOCAL weekday, not the UTC one', () => {
    const mondaysOnly = prefs({ weekdays: [1], remindTime: '23:00' })
    // 2026-03-10T03:30Z is still Monday 23:30 in New York (but already Tuesday in UTC).
    expect(dailyReminderDue({ prefs: mondaysOnly, now: '2026-03-10T03:30:00Z', timeZone: NY })).toEqual({ due: true, date: '2026-03-09' })
    // The same instant in Tokyo is Tuesday 12:30: not a Monday, so not due.
    expect(dailyReminderDue({ prefs: mondaysOnly, now: '2026-03-10T03:30:00Z', timeZone: 'Asia/Tokyo' }).due).toBe(false)
  })

  it('does not repeat once today has been delivered', () => {
    const delivered = prefs({ lastNotifiedOn: '2026-03-10' })
    expect(dailyReminderDue({ prefs: delivered, now: '2026-03-10T13:30:00Z', timeZone: NY }).due).toBe(false)
    expect(dailyReminderDue({ prefs: prefs({ lastNotifiedOn: '2026-03-09' }), now: '2026-03-10T13:30:00Z', timeZone: NY }).due).toBe(true)
  })

  it('handles the spring-forward gap: a time that does not exist resolves forward', () => {
    // 2026-03-08 02:30 does not exist in New York; it is treated as 03:30 EDT = 07:30Z.
    expect(reminderInstant('2026-03-08', '02:30', NY)).toBe(Date.parse('2026-03-08T07:30:00Z'))
    const p = prefs({ remindTime: '02:30' })
    expect(dailyReminderDue({ prefs: p, now: '2026-03-08T07:29:00Z', timeZone: NY }).due).toBe(false)
    expect(dailyReminderDue({ prefs: p, now: '2026-03-08T07:30:00Z', timeZone: NY }).due).toBe(true)
  })

  it('keeps the same local time across the clock change', () => {
    expect(reminderInstant('2026-03-07', '09:00', NY)).toBe(Date.parse('2026-03-07T14:00:00Z')) // EST
    expect(reminderInstant('2026-03-09', '09:00', NY)).toBe(Date.parse('2026-03-09T13:00:00Z')) // EDT
  })
})

describe('next daily reminder', () => {
  const next = (over, now) => nextDailyReminder({ prefs: prefs(over), now, timeZone: NY })

  it('is today if the time has not come, otherwise the next matching day', () => {
    expect(next({}, '2026-03-10T12:00:00Z')).toMatchObject({ date: '2026-03-10', time: '09:00' })
    expect(next({}, '2026-03-10T14:00:00Z')).toMatchObject({ date: '2026-03-11' })
    expect(next({ weekdays: [6] }, '2026-03-10T12:00:00Z')).toMatchObject({ date: '2026-03-14' }) // Saturday
  })

  it('skips today when it was already delivered, and is null when off', () => {
    expect(next({ lastNotifiedOn: '2026-03-10' }, '2026-03-10T11:00:00Z')).toMatchObject({ date: '2026-03-11' })
    expect(next({ enabled: false }, '2026-03-10T12:00:00Z')).toBeNull()
  })
})

describe('task reminders', () => {
  const r = (over) => ({ id: 'r1', planDate: '2026-03-10', remindTime: '15:00', notifiedAt: null, title: 'Call mum', completion: 0, planState: 'active', ...over })
  // 15:00 local on 2026-03-10 = 19:00Z.

  it('is due inside the window, once, and only for open tasks', () => {
    const due = (reminder, now = '2026-03-10T19:05:00Z') => dueTaskReminders({ reminders: [reminder], now, timeZone: NY }).length
    expect(due(r())).toBe(1)
    expect(due(r(), '2026-03-10T18:59:00Z')).toBe(0)
    expect(due(r(), '2026-03-10T21:05:00Z')).toBe(0) // after the window
    expect(due(r({ notifiedAt: '2026-03-10T19:00:10Z' }))).toBe(0) // already delivered
    expect(due(r({ completion: 1 }))).toBe(0) // finished tasks are not nagged
    expect(due(r({ planState: 'excluded' }))).toBe(0)
  })

  it('uses the task date and the user\'s local time, not the viewer\'s timezone', () => {
    const tomorrow = r({ planDate: '2026-03-11' })
    expect(dueTaskReminders({ reminders: [tomorrow], now: '2026-03-10T19:05:00Z', timeZone: NY })).toHaveLength(0)
    // 15:00 in Kolkata is 09:30Z.
    expect(dueTaskReminders({ reminders: [r()], now: '2026-03-10T09:35:00Z', timeZone: 'Asia/Kolkata' })).toHaveLength(1)
    expect(dueTaskReminders({ reminders: [r()], now: '2026-03-10T09:35:00Z', timeZone: NY })).toHaveLength(0)
  })

  it('lists upcoming reminders soonest first and leaves out past, delivered and finished ones', () => {
    const list = upcomingTaskReminders({
      reminders: [
        r({ id: 'c', planDate: '2026-03-11', remindTime: '08:00' }),
        r({ id: 'a', remindTime: '16:00' }),
        r({ id: 'past', remindTime: '08:00' }),
        r({ id: 'sent', remindTime: '17:00', notifiedAt: '2026-03-10T21:00:00Z' }),
        r({ id: 'done', remindTime: '18:00', completion: 1 }),
      ],
      now: '2026-03-10T15:00:00Z', // 11:00 local
      timeZone: NY,
    })
    expect(list.map((x) => x.id)).toEqual(['a', 'c'])
    expect(list.every((x) => x.instant > Date.parse('2026-03-10T15:00:00Z'))).toBe(true)
  })
})

describe('wording', () => {
  it('is calm: no streaks, no pressure', () => {
    const text = JSON.stringify([dailyReminderText(), taskReminderText('Stretch')])
    expect(text).not.toMatch(/streak|miss|behind|fail|don.t forget|overdue|last chance|hurry|lazy/i)
    expect(taskReminderText('Stretch').body).toContain('Stretch')
  })
})
