import { CHALLENGE_CATEGORIES } from '../constants/demoChallenges.js'

// The challenges under one heading per category: the library's own category order first, then anything else (a person's own
// challenges) last. Inside a category the order they came in is kept.
export function groupByCategory(challenges) {
  const groups = new Map()
  for (const c of challenges) groups.set(c.category, [...(groups.get(c.category) ?? []), c])
  const rank = (category) => (CHALLENGE_CATEGORIES.includes(category) ? CHALLENGE_CATEGORIES.indexOf(category) : CHALLENGE_CATEGORIES.length)
  return [...groups].sort(([a], [b]) => rank(a) - rank(b)).map(([category, items]) => ({ category, items }))
}
