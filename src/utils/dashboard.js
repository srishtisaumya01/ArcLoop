// Turns the planner's own summaries (the same ones the Week and Progress pages show) into what the dashboard displays.
// Nothing is recalculated here: every number comes from a weekly summary or a habit summary.

const parseLocal = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const toLocalDate = parseLocal

// Today's tasks and progress, from the current week's summary. `kind` is the day's own kind:
// planned | rest | empty | upcoming (today before it has a record) | no_record.
export function summarizeToday(week) {
  const day = week?.days.find((d) => d.date === week.today)
  if (!day) return null
  const tasks = day.tasks ?? []
  switch (day.kind) {
    case 'planned':
      return { kind: 'planned', count: day.count, done: day.done, partial: day.partial, left: day.remaining ?? day.count - day.done, percent: day.percent, tasks }
    case 'upcoming':
      return { kind: tasks.length ? 'planned' : 'empty', count: day.plannedCount ?? tasks.length, done: 0, partial: 0, left: day.plannedCount ?? tasks.length, percent: 0, tasks }
    case 'rest':
      return { kind: 'rest', count: 0, done: 0, partial: 0, left: 0, percent: 0, tasks }
    default:
      return { kind: 'empty', count: 0, done: 0, partial: 0, left: 0, percent: 0, tasks }
  }
}

// One entry per day of the week: how it went (a percent), or how much is planned.
export function weekBars(week) {
  if (!week) return []
  return week.days.map((d) => ({
    date: d.date,
    kind: d.kind,
    isToday: d.date === week.today,
    isRest: d.kind === 'rest',
    percent: d.kind === 'planned' ? d.percent : null,
    planned: d.kind === 'upcoming' ? (d.plannedCount ?? 0) : (d.count ?? 0),
  }))
}

// The weekly averages that exist (a week needs enough planned days to have one), oldest first, ready for a chart.
export function trendPoints(weeks) {
  return [...weeks]
    .reverse()
    .filter((w) => w.eligible && w.averagePercent !== null)
    .map((w) => ({ weekStart: w.weekStart, value: w.averagePercent }))
}

// The repeating tasks that are going best, for a short list. Ended tasks and tasks without a percentage are left out.
export function topHabits(habits, limit = 4) {
  return habits
    .filter((h) => !h.archived && h.percent !== null && h.percent !== undefined)
    .sort((a, b) => b.percent - a.percent || a.title.localeCompare(b.title))
    .slice(0, limit)
}

// Nothing planned anywhere yet: the person is new, so the dashboard offers a first step instead of empty charts.
export const isBrandNew = (progress) =>
  Boolean(progress) && progress.habits.habits.length === 0 && progress.weeks.every((w) => w.daysWithPlan === 0 && w.upcomingTasks === 0 && w.tasksDone === 0)
