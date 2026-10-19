import { parseTime } from '../../utils/planner/index.js'

const DEFAULT_BLOCK_MINUTES = 30 // a task with a start but no end and no estimate is treated as a half-hour block when marking "Now"

// Which scheduled tasks to call "Now" (their time block is under way) and "Next up" (the first one still to come). Done tasks are never
// marked. `nowMinutes` is the time of day in minutes, or null when the day on screen is not today (then nothing is marked).
export function scheduleMarkers(tasks, nowMinutes) {
  const markers = new Map()
  if (nowMinutes === null) return markers
  let nextFound = false
  for (const task of tasks) {
    if (!task.plannedStart || task.completion >= 1) continue
    const start = parseTime(task.plannedStart)
    const end = task.plannedEnd ? parseTime(task.plannedEnd) : start + (task.estimatedMinutes ?? DEFAULT_BLOCK_MINUTES)
    if (start <= nowMinutes && nowMinutes < end) markers.set(task.id, 'now')
    else if (start > nowMinutes && !nextFound) {
      markers.set(task.id, 'next')
      nextFound = true
    }
  }
  return markers
}
