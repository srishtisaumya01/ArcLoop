// Wording for Busy and Rest days (docs/DAILY_PLANNING_SPEC.md, calm messages). Kept in one place so the
// text is reviewed and tested as written. Nothing here counts, scores or scolds.
export const DAY_MODE_COPY = Object.freeze({
  busy: Object.freeze({
    heading: 'Keep what matters today. The rest can wait.',
    offer: (n) => `Set aside the ${n === 1 ? 'task that isn’t' : `${n} tasks that aren’t`} marked priority? ${n === 1 ? 'It stays' : 'They stay'} listed under “Set aside or moved” and can be put back any time.`,
    nothing: 'Nothing else needs setting aside: what is left is done or marked priority. You can still set any task aside yourself.',
    apply: 'Set these aside',
  }),
  rest: Object.freeze({
    heading: 'Rest is part of the plan.',
    offer: (n) => `Set aside ${n === 1 ? 'the open task' : `all ${n} open tasks`} for today? ${n === 1 ? 'It stays' : 'They stay'} listed under “Set aside or moved” and can be put back any time.`,
    nothing: 'Nothing is open, so there is nothing to set aside.',
    apply: 'Set them aside',
  }),
  keep: 'Keep them all',
})
