// Wording for Minimum Day. Kept in one place so the text is reviewed and tested as written. It never counts, scores or
// scolds: a minimum that is not finished is simply still there, and nothing is lost either way.
export const MINIMUM_DAY_COPY = Object.freeze({
  name: 'Minimum Day',
  description: 'Choose a few important tasks to keep your day moving.',
  complete: 'You showed up for yourself today.',
  incomplete: 'Your minimum is still here whenever you’re ready.',
  noneChosen: 'You haven’t chosen a minimum for this day. That is fine.',
  noTasks: 'Add a task first, then you can choose which ones are your minimum.',
  choose: 'Choose your minimum',
  change: 'Change minimum',
  clear: 'Clear minimum',
  save: 'Save minimum',
  cancel: 'Cancel',
  legend: (limit) => `Choose up to ${limit} tasks`,
  chosen: (n, limit) => `${n} of ${limit} chosen`,
  progress: (done, count) => `${done} of ${count} done`,
  saveFailed: 'That didn’t save. Please try again.',
})
