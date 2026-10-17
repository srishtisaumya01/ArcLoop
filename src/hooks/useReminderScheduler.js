import { useCallback, useEffect, useRef, useState } from 'react'
import { reminderService } from '../services/reminders/index.js'
import { showNotification } from '../services/notifications/browserNotifications.js'
import { REMINDERS_CHANGED } from './reminderEvents.js'
import { PROFILE_CHANGED } from './profileEvents.js'
import { dailyReminderDue, dailyReminderText, dueTaskReminders, taskReminderText } from '../utils/planner/index.js'

const TICK_MS = 30 * 1000
const RELOAD_MS = 5 * 60 * 1000

// Delivers reminders while the app is open: checks every 30 seconds whether the daily reminder or
// a task reminder is due, claims it in the database (so another tab, a reload or a second device
// cannot deliver the same one), then shows an in-app notice and, if the user allowed it, a browser
// notification. It cannot deliver anything while the page is closed. Failures are silent: a
// reminder is a convenience and must never break the app.
//   notices: [{ key, title, body, kind, planDate }]    dismiss(key)
// `now` and `tickMs` can be injected (tests); the app uses the real clock and a 30 second check.
export function useReminderScheduler({ now: readClock = Date.now, tickMs = TICK_MS } = {}) {
  const [notices, setNotices] = useState([])
  const state = useRef({ ctx: null, prefs: null, reminders: [], delivering: new Set() })

  const load = useCallback(async () => {
    try {
      const [ctx, prefs] = await Promise.all([reminderService.getContext(), reminderService.getPreferences()])
      const reminders = prefs.enabled ? await reminderService.listTaskReminders({ from: ctx.today, to: ctx.today }) : []
      state.current = { ...state.current, ctx, prefs, reminders }
    } catch {
      // Not signed in, offline, or not configured: try again at the next reload.
    }
  }, [])

  const deliver = useCallback((notice) => {
    setNotices((list) => (list.some((n) => n.key === notice.key) ? list : [...list, notice]))
    showNotification({ title: notice.title, body: notice.body, tag: notice.key })
  }, [])

  const tick = useCallback(async () => {
    const { ctx, prefs, reminders, delivering } = state.current
    if (!ctx || !prefs?.enabled) return
    const now = readClock()
    try {
      const daily = dailyReminderDue({ prefs, now, timeZone: ctx.timeZone })
      const dailyKey = `daily:${daily.date}`
      if (daily.due && !delivering.has(dailyKey)) {
        delivering.add(dailyKey)
        if (await reminderService.claimDailyReminder(daily.date)) {
          state.current.prefs = { ...state.current.prefs, lastNotifiedOn: daily.date }
          deliver({ key: dailyKey, kind: 'daily', planDate: daily.date, ...dailyReminderText() })
        }
      }
      for (const reminder of dueTaskReminders({ reminders, now, timeZone: ctx.timeZone })) {
        const key = `task:${reminder.id}:${reminder.remindTime}`
        if (delivering.has(key)) continue
        delivering.add(key)
        if (await reminderService.claimTaskReminder(reminder.id)) {
          state.current.reminders = state.current.reminders.map((r) => (r.id === reminder.id ? { ...r, notifiedAt: new Date(now).toISOString() } : r))
          deliver({ key, kind: 'task', planDate: reminder.planDate, ...taskReminderText(reminder.title) })
        }
      }
    } catch {
      // Best effort; the next tick tries again.
    }
  }, [deliver, readClock])

  useEffect(() => {
    let alive = true
    const run = () => alive && load().then(() => alive && tick())
    run()
    const tickTimer = setInterval(() => alive && tick(), tickMs)
    const reloadTimer = setInterval(run, RELOAD_MS)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(REMINDERS_CHANGED, run)
    window.addEventListener(PROFILE_CHANGED, run)
    return () => {
      alive = false
      clearInterval(tickTimer)
      clearInterval(reloadTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(REMINDERS_CHANGED, run)
      window.removeEventListener(PROFILE_CHANGED, run)
    }
  }, [load, tick, tickMs])

  const dismiss = useCallback((key) => setNotices((list) => list.filter((n) => n.key !== key)), [])
  return { notices, dismiss }
}
