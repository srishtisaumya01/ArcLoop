import { DEFAULT_PRIORITY, levelOf } from '../../utils/planner/priority.js'

// Helpers for the add and edit task forms.
export const EMPTY_TASK = { title: '', description: '', category: '', plannedStart: '', plannedEnd: '', estimatedMinutes: '', priorityLevel: DEFAULT_PRIORITY }

const text = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

// Form values -> the input the planner validates. Validation itself stays in the planner logic
// (titles, lengths, time order, "an end time needs a start time").
export function toTaskInput(values) {
  const minutes = String(values.estimatedMinutes ?? '').trim()
  return {
    title: values.title,
    description: text(values.description),
    category: text(values.category),
    plannedStart: values.plannedStart || null,
    plannedEnd: values.plannedEnd || null,
    estimatedMinutes: minutes === '' ? null : Number(minutes),
    priorityLevel: values.priorityLevel,
  }
}

export function taskToValues(task) {
  return {
    title: task.title,
    description: task.description ?? '',
    category: task.category ?? '',
    plannedStart: task.plannedStart ?? '',
    plannedEnd: task.plannedEnd ?? '',
    estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
    priorityLevel: levelOf(task),
  }
}
