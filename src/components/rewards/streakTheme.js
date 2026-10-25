// Colours of the streak cards: dark blue with the site's teal and mint, in both the light and the dark theme.
const STREAK = {
  card: 'linear-gradient(135deg, #07184F 0%, #0A2166 100%)', solid: '#08195A', border: 'rgba(124, 240, 192, 0.28)', strong: '#FFFFFF', text: '#EAF1FF', muted: 'rgba(234, 241, 255, 0.7)', accent: '#7CF0C0', line: '#7CF0C0',
  cells: ['rgba(255, 255, 255, 0.09)', '#1E7F49', '#24A148', '#3DDC6E', '#7CF59A'], // days with progress are green; the rest is the card's blue
  streakGreen: '#3DDC6E', gridLines: 'rgba(255, 255, 255, 0.14)', ringTrack: 'rgba(255, 255, 255, 0.18)', shadow: '0 10px 28px rgba(6, 18, 43, 0.3)',
  selectBg: 'rgba(255, 255, 255, 0.12)', selectBorder: 'rgba(255, 255, 255, 0.3)', selectText: '#FFFFFF', optionBg: '#0A2166', scheme: 'dark', dot: '#FFFFFF',
}

export const useStreakTheme = () => STREAK
