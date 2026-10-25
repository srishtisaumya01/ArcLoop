import { useThemeMode } from '../../hooks/useThemeMode.js'

// Colours of the streak cards. Two looks: "brand" (the site's own royal blue, teal and mint) and "classic" (black with GitHub green).
// Brand is shown; add ?streak=classic to the address to see classic again. Each look has a dark and a light version.
const CLASSIC_DARK = {
  card: '#0D1117', solid: '#0D1117', border: '#1E6B34', strong: '#FFFFFF', text: '#E6EDF3', muted: '#8B949E', accent: '#39D353', line: '#22E55C',
  cells: ['#161B22', '#0E4429', '#006D32', '#26A641', '#39D353'], gridLines: '#1B3A25', ringTrack: '#1E2A22', shadow: '0 8px 24px rgba(1, 4, 9, 0.25)',
  selectBg: '#21262D', selectBorder: '#3D444D', selectText: '#F0F6FC', optionBg: '#161B22', scheme: 'dark', dot: '#FFFFFF',
}
const CLASSIC_LIGHT = {
  card: '#FFFFFF', solid: '#FFFFFF', border: '#B7DFC2', strong: '#0B1B3A', text: '#24292F', muted: '#57606A', accent: '#1A7F37', line: '#1A9F4B',
  cells: ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'], gridLines: '#DCEBE0', ringTrack: '#DDEFE2', shadow: '0 8px 24px rgba(11, 27, 58, 0.08)',
  selectBg: '#F6F8FA', selectBorder: '#D0D7DE', selectText: '#24292F', optionBg: '#FFFFFF', scheme: 'light', dot: '#FFFFFF',
}
const BRAND_DARK = {
  card: 'linear-gradient(135deg, #0A1F66 0%, #0F2F86 55%, #135C86 100%)', solid: '#0E2A7A', border: 'rgba(124, 240, 192, 0.35)', strong: '#FFFFFF', text: '#EAF1FF', muted: 'rgba(234, 241, 255, 0.7)', accent: '#7CF0C0', line: '#7CF0C0',
  cells: ['rgba(255, 255, 255, 0.1)', '#1F5FC9', '#2A8CD8', '#2ED6B5', '#7CF0C0'], gridLines: 'rgba(255, 255, 255, 0.14)', ringTrack: 'rgba(255, 255, 255, 0.18)', shadow: '0 10px 28px rgba(6, 18, 43, 0.35)',
  selectBg: 'rgba(255, 255, 255, 0.12)', selectBorder: 'rgba(255, 255, 255, 0.3)', selectText: '#FFFFFF', optionBg: '#0F2F86', scheme: 'dark', dot: '#FFFFFF',
}
const BRAND_LIGHT = {
  card: 'linear-gradient(135deg, #F4F9FF 0%, #EAF4FB 55%, #E6F6F0 100%)', solid: '#EEF6FB', border: '#C7DAF1', strong: '#0B1B3A', text: '#14284B', muted: '#5B6B85', accent: '#1B5BC8', line: '#1B5BC8',
  cells: ['#E1E9F4', '#BBD3F5', '#6FA8EA', '#2FA8C8', '#17A97A'], gridLines: '#D3DEEC', ringTrack: '#D3DEEC', shadow: '0 8px 24px rgba(11, 27, 58, 0.08)',
  selectBg: '#FFFFFF', selectBorder: '#C7DAF1', selectText: '#14284B', optionBg: '#FFFFFF', scheme: 'light', dot: '#FFFFFF',
}

export function useStreakTheme() {
  const { mode } = useThemeMode()
  const classic = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('streak') === 'classic'
  if (classic) return mode === 'dark' ? CLASSIC_DARK : CLASSIC_LIGHT
  return mode === 'dark' ? BRAND_DARK : BRAND_LIGHT
}
