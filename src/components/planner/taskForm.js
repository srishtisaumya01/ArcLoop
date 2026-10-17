// Helpers for the add and edit task forms.
export const EMPTY_TASK = { title: '', plannedStart: '', estimatedMinutes: '', isPriority: false }

// Form values -> the input the planner validates. Validation itself stays in the planner logic.
export function toTaskInput(values) {
  const minutes = String(values.estimatedMinutes ?? '').trim()
  return {
    title: values.title,
    plannedStart: values.plannedStart || null,
    estimatedMinutes: minutes === '' ? null : Number(minutes),
    isPriority: values.isPriority,
  }
}

export function taskToValues(task) {
  return {
    title: task.title,
    plannedStart: task.plannedStart ?? '',
    estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
    isPriority: Boolean(task.isPriority),
  }
}
