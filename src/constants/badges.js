// The look of each streak badge (the lengths and titles themselves come from the server). `from`/`to` colour the gem.
export const BADGE_STYLES = {
  15: { from: '#4ADE80', to: '#047857', glow: '#86EFAC' },
  30: { from: '#38BDF8', to: '#1D4ED8', glow: '#7DD3FC' },
  50: { from: '#C4B5FD', to: '#6D28D9', glow: '#DDD6FE' },
  75: { from: '#FCD34D', to: '#B45309', glow: '#FDE68A' },
  100: { from: '#FEF08A', to: '#CA8A04', glow: '#FEF9C3' },
}
export const badgeStyle = (days) => BADGE_STYLES[days] ?? BADGE_STYLES[15]
