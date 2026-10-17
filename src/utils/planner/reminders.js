import { compareDates, addDays, isoWeekday, isValidTime } from './localDates.js'
import { localDateOf, toInstantMs, zonedDateTimeToInstant, assertTimeZone } from './timeZones.js'

// Reminder rules (pure). Nothing here reads the clock: `now` and `timeZone` are always arguments.
//  - Reminders are off until the user turns them on, and a task has one only if the user set it.
//  - Times and weekdays are the user's local ones (profile timezone); the instant a reminder is due
//    is computed with the same gap/overlap rules as the rest of the planner.
//  - A reminder is delivered once. The caller records that it was delivered (notifiedAt /
//    lastNotifiedOn) and this module never reports a recorded reminder as due again.
//  - A reminder is only delivered close to its time. Opening the app much later does not replay it,
//    and nothing is ever reported as "missed" (no guilt).

export const REMINDER_DEFAULTS = Object.freeze({
  enabled: false,
  remindTime: '09:00',
  weekdays: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
  lastNotifiedOn: '1970-01-01',
})

// PROVISIONAL: how long after its time a reminder may still be delivered.
export const REMINDER_GRACE_MINUTES = 120

const GRACE_MS = REMINDER_GRACE_MINUTES * 60000
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

// 'HH:MM' on a whole minute (the database stores whole minutes only).
export const isValidReminderTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && isValidTime(value)

export function validateReminderTime(value) {
  return isValidReminderTime(value)
    ? { ok: true, value, errors: {} }
    : { ok: false, value: null, errors: { remindTime: 'Choose a time like 09:30.' } }
}

export function validateReminderPreferences(input) {
  const errors = {}
  if (!input || typeof input !== 'object') return { ok: false, value: null, errors: { form: 'Reminder settings are missing.' } }
  if (typeof input.enabled !== 'boolean') errors.enabled = 'Choose whether reminders are on or off.'
  if (!isValidReminderTime(input.remindTime)) errors.remindTime = 'Choose a time like 09:30.'
  const days = input.weekdays
  const validDays = Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  if (!validDays) errors.weekdays = 'Choose at least one day of the week.'
  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors }
  return { ok: true, value: { enabled: input.enabled, remindTime: input.remindTime, weekdays: [...new Set(days)].sort((a, b) => a - b) }, errors }
}

// The instant a reminder is due: local date + time in the user's zone.
export const reminderInstant = (planDate, remindTime, timeZone) => zonedDateTimeToInstant(planDate, remindTime, timeZone)

function inWindow(nowMs, instant) {
  return nowMs >= instant && nowMs < instant + GRACE_MS
}

// Is today's daily reminder due right now? `lastNotifiedOn` is the local date of the last one
// delivered, so a reminder never repeats on the same day.
export function dailyReminderDue({ prefs, now, timeZone }) {
  assertTimeZone(timeZone)
  const nowMs = toInstantMs(now)
  if (!prefs?.enabled) return { due: false, date: null }
  const date = localDateOf(nowMs, timeZone)
  if (!prefs.weekdays.includes(isoWeekday(date))) return { due: false, date }
  if (compareDates(prefs.lastNotifiedOn, date) >= 0) return { due: false, date }
  return { due: inWindow(nowMs, reminderInstant(date, prefs.remindTime, timeZone)), date }
}

// The next daily reminder still to come (today if its time has not arrived), or null if reminders
// are off. `instant` is epoch ms.
export function nextDailyReminder({ prefs, now, timeZone }) {
  assertTimeZone(timeZone)
  const nowMs = toInstantMs(now)
  if (!prefs?.enabled) return null
  const today = localDateOf(nowMs, timeZone)
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDays(today, offset)
    if (!prefs.weekdays.includes(isoWeekday(date))) continue
    const instant = reminderInstant(date, prefs.remindTime, timeZone)
    if (instant > nowMs && compareDates(prefs.lastNotifiedOn, date) < 0) return { date, time: prefs.remindTime, instant }
  }
  return null
}

// A task reminder only matters while its task is still open.
const isOpen = (r) => r.planState === 'active' && !(r.completion >= 1)

// Task reminders due right now: not yet delivered, task still open, inside the delivery window.
export function dueTaskReminders({ reminders, now, timeZone }) {
  assertTimeZone(timeZone)
  const nowMs = toInstantMs(now)
  return reminders.filter((r) => r.notifiedAt === null && isOpen(r) && inWindow(nowMs, reminderInstant(r.planDate, r.remindTime, timeZone)))
}

// Task reminders still to come, soonest first.
export function upcomingTaskReminders({ reminders, now, timeZone }) {
  assertTimeZone(timeZone)
  const nowMs = toInstantMs(now)
  return reminders
    .filter((r) => r.notifiedAt === null && isOpen(r))
    .map((r) => ({ ...r, instant: reminderInstant(r.planDate, r.remindTime, timeZone) }))
    .filter((r) => r.instant > nowMs)
    .sort((a, b) => a.instant - b.instant || (a.id < b.id ? -1 : 1))
}

// Calm wording. No streaks, no pressure.
export const dailyReminderText = () => ({
  title: 'Your day is ready when you are',
  body: 'Have a look at today’s plan. Progress, not perfection.',
})
export const taskReminderText = (title) => ({
  title: 'A gentle reminder',
  body: `“${title}” is on your plan. Whenever you’re ready.`,
})

export const WEEKDAY_NUMBERS = Object.freeze(ALL_DAYS)
