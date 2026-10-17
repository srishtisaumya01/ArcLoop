import { useCallback, useEffect, useState } from 'react'
import { reminderService } from '../services/reminders/index.js'
import { notifyRemindersChanged } from './reminderEvents.js'

// Reminders the user set on the tasks of one day, plus whether reminders are switched on. Reloads
// whenever `plan` changes (every My Day change reloads the plan), so a finished or removed task's
// reminder disappears with it. A failure to load just means no reminder controls state is shown.
//   set(occurrenceId, 'HH:MM') / remove(occurrenceId) resolve { ok, error } and never throw.
export function useDayReminders(date, plan, enabled) {
  const [loaded, setLoaded] = useState({ date: null, items: [], remindersOn: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !date) return undefined
    let cancelled = false
    Promise.all([reminderService.listTaskReminders({ from: date, to: date }), reminderService.getPreferences()]).then(
      ([items, prefs]) => !cancelled && setLoaded({ date, items, remindersOn: prefs.enabled }),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [date, plan, enabled, attempt])

  const change = useCallback(async (action) => {
    try {
      await action()
      setAttempt((n) => n + 1)
      notifyRemindersChanged()
      return { ok: true, error: null }
    } catch (error) {
      return { ok: false, error }
    }
  }, [])

  const byOccurrence = new Map(loaded.date === date ? loaded.items.map((r) => [r.occurrenceId, r]) : [])
  return {
    byOccurrence,
    remindersOn: loaded.remindersOn,
    set: (occurrenceId, time) => change(() => reminderService.setTaskReminder(occurrenceId, time)),
    remove: (occurrenceId) => change(() => reminderService.removeTaskReminder(occurrenceId)),
  }
}
