export const ALL = 'all'

// Pure filter used by the Explore page. Matches title, summary and category
// (case-insensitive) and applies exact category / visibility filters.
export function filterChallenges(challenges, { query = '', category = ALL, visibility = ALL } = {}) {
  const q = query.trim().toLowerCase()
  return challenges.filter((c) => {
    if (category !== ALL && c.category !== category) return false
    if (visibility !== ALL && c.visibility !== visibility) return false
    if (!q) return true
    return [c.title, c.summary, c.category].some((text) => text.toLowerCase().includes(q))
  })
}

export function hasActiveFilters({ query = '', category = ALL, visibility = ALL } = {}) {
  return query.trim() !== '' || category !== ALL || visibility !== ALL
}
