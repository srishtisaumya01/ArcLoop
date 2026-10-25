import { useId } from 'react'
import { badgeStyle } from '../../constants/badges.js'

const HEX = (cx, cy, rx, ry) => [[cx, cy - ry], [cx + rx, cy - ry / 2], [cx + rx, cy + ry / 2], [cx, cy + ry], [cx - rx, cy + ry / 2], [cx - rx, cy - ry / 2]].map((p) => p.join(',')).join(' ')

// A hexagon medal: a silver rim, a coloured gem with the number of days, and a "DAYS" band. Locked ones are grey.
export default function BadgeHex({ days, locked = false, size = 96 }) {
  const id = useId().replace(/:/g, '')
  const { from, to } = badgeStyle(days)
  return (
    <svg width={size} height={size * 1.08} viewBox="0 0 120 130" role="img" aria-label={`${days} days`} style={{ display: 'block', opacity: locked ? 0.45 : 1, filter: locked ? 'grayscale(1)' : 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }}>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4F6F8" /><stop offset="0.5" stopColor="#9AA3AF" /><stop offset="1" stopColor="#E5E7EB" /></linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
      </defs>
      <polygon points={HEX(60, 62, 54, 60)} fill={`url(#${id}r)`} />
      <polygon points={HEX(60, 62, 46, 51)} fill="#1F2937" />
      <polygon points={HEX(60, 62, 41, 45)} fill={`url(#${id}g)`} />
      <ellipse cx="46" cy="38" rx="18" ry="9" fill="#FFFFFF" opacity="0.22" transform="rotate(-25 46 38)" />
      <text x="60" y="72" textAnchor="middle" fontSize={days >= 100 ? 30 : 36} fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="#FFFFFF" stroke="rgba(0,0,0,0.25)" strokeWidth="1">{days}</text>
      <rect x="34" y="88" width="52" height="14" rx="7" fill="#111827" />
      <text x="60" y="98.5" textAnchor="middle" fontSize="9" fontWeight="800" letterSpacing="2" fontFamily="Arial, Helvetica, sans-serif" fill="#E5E7EB">DAYS</text>
    </svg>
  )
}
