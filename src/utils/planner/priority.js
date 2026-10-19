// Priority has three levels. `isPriority` stays on tasks as "the level is high" (older code, the calendar export and the backend's
// legacy column all read it), and the two never disagree: the level is the one to set.
export const PRIORITY_LEVELS = Object.freeze(['high', 'medium', 'low'])
export const DEFAULT_PRIORITY = 'medium'
export const PRIORITY_LABELS = Object.freeze({ high: 'High', medium: 'Medium', low: 'Low' })

export const isPriorityLevel = (value) => PRIORITY_LEVELS.includes(value)

// The level of anything that carries `priorityLevel` and/or the old `isPriority` flag (a level wins over the flag).
export function levelOf(task) {
  if (task && isPriorityLevel(task.priorityLevel)) return task.priorityLevel
  return task && task.isPriority ? 'high' : DEFAULT_PRIORITY
}

// What turning the old flag on or off means for a task that currently has `current`: on is high; off lowers high to medium and
// leaves a low level alone (the same rule the backend applies to an older client).
export function levelFromFlag(current, flag) {
  if (flag) return 'high'
  return current === 'high' ? DEFAULT_PRIORITY : isPriorityLevel(current) ? current : DEFAULT_PRIORITY
}

// `changes` is a partial edit of `task`. If it speaks only the old flag, turn that into a level so a merge cannot keep a stale level.
export function withLevelFromFlag(task, changes) {
  if (!changes || !('isPriority' in changes) || 'priorityLevel' in changes) return changes
  return { ...changes, priorityLevel: levelFromFlag(levelOf(task), Boolean(changes.isPriority)) }
}
