import { useThemeMode } from '../../hooks/useThemeMode.js'

// Colours of the streak cards: white cards with a brand-gradient top edge, green for progress, the site's blue for the rest.
const BAR = {
  position: 'relative',
  overflow: 'hidden',
  '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #1B5BC8, #17A2B8, #2ED68B)' },
}
const STREAK = {
  card: '#FFFFFF', solid: '#FFFFFF', border: '#D3E2F6', strong: '#0B1B3A', text: '#14284B', muted: '#5B6B85', accent: '#1B5BC8', line: '#12A67A',
  cells: ['#E8EEF7', '#BFE9CF', '#6FD39A', '#2DB86B', '#118A4A'], streakGreen: '#16A34A', gridLines: '#DCE6F3', ringTrack: '#E1E9F4', shadow: '0 10px 30px rgba(27, 91, 200, 0.14)',
  selectBg: '#F3F7FD', selectBorder: '#CBD9EE', selectText: '#14284B', optionBg: '#FFFFFF', scheme: 'light', dot: '#FFFFFF', bar: BAR,
}

// In the site's dark theme the cards are dark blue instead (a white card would glare there).
const STREAK_DARK = {
  ...STREAK,
  card: 'linear-gradient(135deg, #07184F 0%, #0A2166 100%)', solid: '#08195A', border: 'rgba(124, 240, 192, 0.28)', strong: '#FFFFFF', text: '#EAF1FF', muted: 'rgba(234, 241, 255, 0.7)', accent: '#7CF0C0', line: '#7CF0C0',
  cells: ['rgba(255, 255, 255, 0.09)', '#1E7F49', '#24A148', '#3DDC6E', '#7CF59A'], streakGreen: '#3DDC6E', gridLines: 'rgba(255, 255, 255, 0.14)', ringTrack: 'rgba(255, 255, 255, 0.18)', shadow: '0 10px 28px rgba(6, 18, 43, 0.3)',
  selectBg: 'rgba(255, 255, 255, 0.12)', selectBorder: 'rgba(255, 255, 255, 0.3)', selectText: '#FFFFFF', optionBg: '#0A2166', scheme: 'dark', dot: '#FFFFFF',
}

export function useStreakTheme() {
  const { mode } = useThemeMode()
  return mode === 'dark' ? STREAK_DARK : STREAK
}
