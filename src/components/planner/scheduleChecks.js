import { parseTime } from '../../utils/planner/index.js'
import { formatMinutes } from './weekFormat.js'

// Gentle checks on a day's schedule. Plain functions of the day's open tasks (and, for today, the time of day): nothing here changes a task
// or blocks anything, it only finds things worth a second look. Times are minutes after midnight.
const DAY = 24 * 60
export const LONG_DAY_MINUTES = 16 * 60 // more work planned than one day can hold, however early it starts

const pad = (n) => String(n).padStart(2, '0')
export const clockText = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

// The block a task takes in the day: from its start to its end, or to start + estimate when only an estimate is known; `end` is null when
// only a start is known (a point in the day). Tasks with no start time have no block.
export function blockOf(task) {
  if (!task.plannedStart) return null
  const start = parseTime(task.plannedStart)
  let end = null
  if (task.plannedEnd) end = parseTime(task.plannedEnd)
  else if (task.estimatedMinutes) end = Math.min(DAY, start + task.estimatedMinutes)
  return { start, end }
}

const isOpen = (task) => task.completion < 1

// Two blocks overlap when they share some of the day. A block known only by its start overlaps another when it starts inside it (or at the
// same moment); two bare starts overlap only when they are at the same minute. Back-to-back blocks do not overlap.
function overlap(a, b) {
  if (a.end !== null && b.end !== null) return a.start < b.end && b.start < a.end
  if (a.end === null && b.end === null) return a.start === b.start
  const [point, block] = a.end === null ? [a, b] : [b, a]
  return point.start >= block.start && point.start < block.end
}

// Every pair of open scheduled tasks that overlap, earliest first: [{ first, second }].
export function findOverlaps(tasks) {
  const scheduled = tasks
    .filter((t) => isOpen(t) && t.plannedStart)
    .map((task) => ({ task, block: blockOf(task) }))
    .sort((a, b) => a.block.start - b.block.start || a.task.id.localeCompare(b.task.id))
  const pairs = []
  for (let i = 0; i < scheduled.length; i += 1) {
    for (let j = i + 1; j < scheduled.length; j += 1) {
      if (overlap(scheduled[i].block, scheduled[j].block)) pairs.push({ first: scheduled[i].task, second: scheduled[j].task })
    }
  }
  return pairs
}

// How long a task is expected to take: its block when it has both times, else its estimate, else unknown (0).
function durationOf(task) {
  if (task.plannedStart && task.plannedEnd) return parseTime(task.plannedEnd) - parseTime(task.plannedStart)
  return task.estimatedMinutes ?? 0
}

// The checks for one day. `nowMinutes` is the time of day when the day is today, else null.
//   -> { overlaps: [{ first, second }], load: null | { kind: 'left-today' | 'too-long', minutes, left } }
export function checkSchedule({ tasks, nowMinutes = null }) {
  const overlaps = findOverlaps(tasks)
  const minutes = tasks.filter(isOpen).reduce((sum, t) => sum + durationOf(t), 0)
  let load = null
  if (nowMinutes !== null && minutes > 0 && minutes > DAY - nowMinutes && DAY - nowMinutes < LONG_DAY_MINUTES) {
    load = { kind: 'left-today', minutes, left: DAY - nowMinutes }
  } else if (minutes > LONG_DAY_MINUTES) {
    load = { kind: 'too-long', minutes, left: null }
  }
  return { overlaps, load }
}

const label = (task) => {
  const block = blockOf(task)
  const when = block.end !== null ? `${clockText(block.start)} to ${clockText(block.end)}` : clockText(block.start)
  return `“${task.title}” (${when})`
}

// The words for each finding, calm and without blame.
export function describeChecks({ overlaps, load }) {
  const lines = overlaps.map(({ first, second }) => `${label(first)} overlaps ${label(second)}.`)
  if (load?.kind === 'left-today') {
    lines.push(`About ${formatMinutes(load.minutes)} of tasks are still planned, and about ${formatMinutes(load.left)} are left today. Moving one or two to another day is fine.`)
  } else if (load?.kind === 'too-long') {
    lines.push(`About ${formatMinutes(load.minutes)} of tasks are planned for this day, which is more than a day can hold. Moving some to another day would help.`)
  }
  return lines
}

// Something that changes when the findings change, so a dismissed note comes back only for something new.
export const checkSignature = ({ overlaps, load }) =>
  JSON.stringify([overlaps.map(({ first, second }) => [first.id, second.id]), load ? [load.kind, Math.round(load.minutes / 30)] : null])

export const hasFindings = ({ overlaps, load }) => overlaps.length > 0 || load !== null
