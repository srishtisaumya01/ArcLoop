// The end-of-day look back, as plain functions of the day's tasks. Nothing here changes a task.

// What happened to the day's planned tasks (set-aside, moved and removed ones are not part of it):
//   done: ticked off    open: not done (partly done ones included)    partly: open with some progress
//   carryable: open one-off tasks, which can be carried to tomorrow    repeating: open repeating tasks, which come back on their own days
// A task made once also has a template (recurrence "once"), so a task's `templateId` does not say whether it repeats: `repeatingTemplateIds`
// is the set of ids of the person's templates that really repeat.
export function wrapUpOf(occurrences, repeatingTemplateIds = new Set()) {
  const planned = occurrences.filter((o) => o.planState === 'active')
  const open = planned.filter((o) => o.completion < 1)
  return {
    done: planned.filter((o) => o.completion >= 1),
    open,
    partly: open.filter((o) => o.completion > 0),
    carryable: open.filter((o) => !repeatingTemplateIds.has(o.templateId)),
    repeating: open.filter((o) => repeatingTemplateIds.has(o.templateId)),
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The words after carrying tasks over: how many moved, where to, and where to undo it; or how far it got when something went wrong.
export function carryMessage({ moved, tomorrowLabel, failure }) {
  if (failure) {
    return moved > 0
      ? `${plural(moved, 'task')} moved to ${tomorrowLabel} before something went wrong: ${failure} The rest stayed where they were.`
      : `Nothing was moved: ${failure}`
  }
  return `${plural(moved, 'task')} moved to ${tomorrowLabel}. Each one can be undone under “Set aside or moved”.`
}
