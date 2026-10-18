import { keyframes } from '@mui/material/styles'

// Shared motion for the landing and community pages. Every animated element also spreads `noMotion` (or uses `enter`,
// which does), so people who ask for reduced motion see the finished state with nothing moving.

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(26px); }
  to { opacity: 1; transform: none; }
`

export const popIn = keyframes`
  0% { opacity: 0; transform: scale(0.6); }
  70% { transform: scale(1.06); }
  100% { opacity: 1; transform: none; }
`

export const floatY = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`

export const grow = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`

export const drift = keyframes`
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(40px, -30px) scale(1.12); }
  100% { transform: translate(-24px, 22px) scale(1); }
`

export const noMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }

// Fade-and-rise entrance that plays once on load; `both` keeps the element hidden during its delay.
export const enter = (delayMs = 0, durationMs = 800) => ({
  animation: `${fadeUp} ${durationMs}ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delayMs}ms both`,
  ...noMotion,
})
