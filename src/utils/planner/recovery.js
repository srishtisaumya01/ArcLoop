import { addDays, compareDates } from './localDates.js'
import { summarizeDay } from './progress.js'

// When to show the gentle "welcome back" notes. Nothing here changes any record, recreates a task or
// counts anything against the person: it only decides whether a calm message is relevant.
//
// A "missed planned day" is a day BEFORE today that had a plan (a recorded day, not a rest day, with at
// least one active task) and no progress at all. A date with no plan is never a missed day, a rest day
// is never one, and a partly done day is not one. Today is not over, so it never counts.

// PROVISIONAL: how far back to look for the last planned day.
export const RECOVERY_LOOKBACK_DAYS = 28

// `summary` comes from summarizeDay for `date`.
export const isMissedPlannedDay = (summary, date, today) =>
  compareDates(date, today) < 0 && summary.kind === 'planned' && summary.current.units === 0

// `records`: [{ day, occurrences }] for the recorded days around today (others are ignored).
// Returning = the most recent planned day before today had no progress, and nothing has been done
// today yet. `missedDates` is that unbroken run of unfinished planned days, oldest first; a day with
// any progress ends the run, and days with no plan or rest days in between are skipped, not counted.
export function recoveryStatus({ records, today, lookbackDays = RECOVERY_LOOKBACK_DAYS }) {
  const earliest = addDays(today, -(lookbackDays - 1))
  const summaries = records
    .map((record) => ({ date: record.day.planDate, summary: summarizeDay(record) }))
    .filter(({ date }) => compareDates(date, earliest) >= 0 && compareDates(date, today) <= 0)
  const todayEntry = summaries.find(({ date }) => date === today)
  if (todayEntry && todayEntry.summary.current.units > 0) return { returning: false, missedDates: [], lastPlannedDate: null }

  const plannedBefore = summaries
    .filter(({ date, summary }) => compareDates(date, today) < 0 && summary.kind === 'planned')
    .sort((a, b) => compareDates(b.date, a.date)) // newest first
  const run = []
  for (const entry of plannedBefore) {
    if (entry.summary.current.units > 0) break
    run.push(entry.date)
  }
  return { returning: run.length > 0, missedDates: run.reverse(), lastPlannedDate: plannedBefore[0]?.date ?? null }
}

// Dates in a week summary (from summarizeWeek) that were missed planned days. Uses the week's own
// `today`, so the current day and later days never count.
export function missedDaysInWeek(week) {
  return week.days.filter((d) => d.kind === 'planned' && d.units === 0 && compareDates(d.date, week.today) < 0).map((d) => d.date)
}
