import { useThemeMode } from '../../hooks/useThemeMode.js'

// Colours of the streak cards in each theme: black with bright green in dark mode, white with deeper green in light mode.
const DARK = {
  card: '#0D1117', border: '#1E6B34', strong: '#FFFFFF', text: '#E6EDF3', muted: '#8B949E', accent: '#39D353', line: '#22E55C',
  cells: ['#161B22', '#0E4429', '#006D32', '#26A641', '#39D353'], gridLines: '#1B3A25', ringTrack: '#1E2A22', shadow: '0 8px 24px rgba(1, 4, 9, 0.25)',
  selectBg: '#21262D', selectBorder: '#3D444D', selectText: '#F0F6FC', optionBg: '#161B22', scheme: 'dark', dot: '#FFFFFF',
}
const LIGHT = {
  card: '#FFFFFF', border: '#B7DFC2', strong: '#0B1B3A', text: '#24292F', muted: '#57606A', accent: '#1A7F37', line: '#1A9F4B',
  cells: ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'], gridLines: '#DCEBE0', ringTrack: '#DDEFE2', shadow: '0 8px 24px rgba(11, 27, 58, 0.08)',
  selectBg: '#F6F8FA', selectBorder: '#D0D7DE', selectText: '#24292F', optionBg: '#FFFFFF', scheme: 'light', dot: '#FFFFFF',
}

export function useStreakTheme() {
  const { mode } = useThemeMode()
  return mode === 'dark' ? DARK : LIGHT
}
