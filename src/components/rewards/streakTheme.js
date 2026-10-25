import { useSyncExternalStore } from 'react'

// Colours of the streak cards: dark blue with the site's teal and mint, in both the light and the dark theme.
const STREAK = {
  card: 'linear-gradient(135deg, #07184F 0%, #0A2166 100%)', solid: '#08195A', border: 'rgba(124, 240, 192, 0.28)', strong: '#FFFFFF', text: '#EAF1FF', muted: 'rgba(234, 241, 255, 0.7)', accent: '#7CF0C0', line: '#7CF0C0',
  cells: ['rgba(255, 255, 255, 0.09)', '#1E7F49', '#24A148', '#3DDC6E', '#7CF59A'], // days with progress are green; the rest is the card's blue
  streakGreen: '#3DDC6E', gridLines: 'rgba(255, 255, 255, 0.14)', ringTrack: 'rgba(255, 255, 255, 0.18)', shadow: '0 10px 28px rgba(6, 18, 43, 0.3)',
  selectBg: 'rgba(255, 255, 255, 0.12)', selectBorder: 'rgba(255, 255, 255, 0.3)', selectText: '#FFFFFF', optionBg: '#0A2166', scheme: 'dark', dot: '#FFFFFF',
}

// Two other looks to compare, picked by the address: ?streak=light (white cards) or ?streak=vivid (bright blue-to-mint gradient).
const LIGHT = {
  card: '#FFFFFF', solid: '#FFFFFF', border: '#D3E2F6', strong: '#0B1B3A', text: '#14284B', muted: '#5B6B85', accent: '#1B5BC8', line: '#12A67A',
  cells: ['#E8EEF7', '#BFE9CF', '#6FD39A', '#2DB86B', '#118A4A'], streakGreen: '#16A34A', gridLines: '#DCE6F3', ringTrack: '#E1E9F4', shadow: '0 10px 30px rgba(27, 91, 200, 0.14)',
  selectBg: '#F3F7FD', selectBorder: '#CBD9EE', selectText: '#14284B', optionBg: '#FFFFFF', scheme: 'light', dot: '#FFFFFF',
}
const VIVID = {
  card: 'linear-gradient(135deg, #1B5BC8 0%, #17A2B8 55%, #2ED68B 100%)', solid: '#1B8FC0', border: 'rgba(255, 255, 255, 0.4)', strong: '#FFFFFF', text: '#FFFFFF', muted: 'rgba(255, 255, 255, 0.82)', accent: '#FFFFFF', line: '#FFFFFF',
  cells: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.75)', '#FFFFFF', '#FFF3A6'], streakGreen: '#FFFFFF', gridLines: 'rgba(255, 255, 255, 0.28)', ringTrack: 'rgba(255, 255, 255, 0.32)', shadow: '0 12px 30px rgba(27, 91, 200, 0.35)',
  selectBg: 'rgba(255, 255, 255, 0.22)', selectBorder: 'rgba(255, 255, 255, 0.5)', selectText: '#FFFFFF', optionBg: '#17609F', scheme: 'dark', dot: '#1B5BC8',
}

// The chosen look is remembered in this browser; the little "Look" picker on the cards changes it (temporary, while comparing).
const KEY = 'arcloop.streakLook'
const EVENT = 'arcloop:streak-look'
export const LOOKS = ['navy', 'light', 'vivid']
const read = () => {
  try {
    const fromAddress = new URLSearchParams(window.location.search).get('streak')
    return LOOKS.includes(fromAddress) ? fromAddress : localStorage.getItem(KEY) || 'navy'
  } catch {
    return 'navy'
  }
}
const subscribe = (cb) => {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
export function setStreakLook(look) {
  try {
    localStorage.setItem(KEY, look)
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  window.dispatchEvent(new Event(EVENT))
}
export function useStreakLook() {
  return useSyncExternalStore(subscribe, read, () => 'navy')
}
export function useStreakTheme() {
  const look = useStreakLook()
  return look === 'light' ? LIGHT : look === 'vivid' ? VIVID : STREAK
}
