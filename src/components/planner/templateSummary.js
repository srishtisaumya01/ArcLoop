// What the edit did to days that already exist, in plain words.
export function editSummary({ updatedOccurrenceIds = [], skipped = [], noLongerMatching = [] }) {
  const parts = ['Saved.']
  if (updatedOccurrenceIds.length > 0) parts.push(`${updatedOccurrenceIds.length} upcoming ${updatedOccurrenceIds.length === 1 ? 'day was' : 'days were'} updated.`)
  const kept = skipped.filter((s) => s.reason === 'has_progress' || s.reason === 'customized' || s.reason === 'set_aside').length
  if (kept > 0) parts.push(`${kept} planned ${kept === 1 ? 'day was' : 'days were'} left as they are because you’ve already worked on or changed ${kept === 1 ? 'it' : 'them'}.`)
  if (noLongerMatching.length > 0) parts.push(`${noLongerMatching.length} planned ${noLongerMatching.length === 1 ? 'day no longer matches' : 'days no longer match'} the new schedule and ${noLongerMatching.length === 1 ? 'was' : 'were'} left in place; you can remove ${noLongerMatching.length === 1 ? 'it' : 'them'} from My Day.`)
  return parts.join(' ')
}
