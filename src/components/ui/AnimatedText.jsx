import { Fragment } from 'react'
import { Box } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { noMotion } from '../../theme/animations.js'

const SPOT_STEP_MS = 70
const WORD_SPOT_STEP_MS = 260

const rise = keyframes`
  from { opacity: 0; transform: translateY(0.55em) rotate(5deg); filter: blur(6px); }
  to { opacity: 1; transform: none; filter: blur(0); }
`

// A pool of light passes over each letter in turn: it brightens, glows mint and lifts a little, then settles.
const spot = keyframes`
  0%, 18%, 100% { color: var(--base); text-shadow: 0 0 0 transparent; transform: none; }
  8% { color: #ffffff; text-shadow: 0 0 14px rgba(124, 240, 192, 0.95), 0 0 34px rgba(124, 240, 192, 0.55); transform: translateY(-4px) scale(1.07); }
`

const sweep = keyframes`
  0% { transform: translateX(-30%); opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { transform: translateX(105%); opacity: 0; }
`

const hex = (n) => Math.round(n).toString(16).padStart(2, '0')
function mix(from, to, amount) {
  const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16))
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16))
  return `#${a.map((v, i) => hex(v + (b[i] - v) * amount)).join('')}`
}

/**
 * Text whose letters rise in one by one, then catch a travelling light. Hindi (and any script where letters join) is
 * animated a word at a time so conjunct letters are never pulled apart. The parent should carry the accessible name
 * (aria-label); the animated copy is hidden from screen readers. Reduced motion shows the plain text.
 *
 * `startIndex` / `totalUnits` let several lines share one light that moves from the first line to the last.
 */
export default function AnimatedText({ text, byWord = false, from = '#ffffff', to = from, startIndex = 0, totalUnits, enterDelay = 0 }) {
  const words = text.split(' ')
  const indexedWords = []
  let unitCount = 0
  for (const word of words) {
    const parts = byWord ? [word] : Array.from(word)
    indexedWords.push({ parts, offset: unitCount })
    unitCount += parts.length
  }
  const step = byWord ? WORD_SPOT_STEP_MS : SPOT_STEP_MS
  const cycle = (totalUnits ?? unitCount) * step + 2600
  const spotStart = enterDelay + unitCount * 45 + 900

  const renderUnit = (content, i) => (
    <Box
      key={i}
      component="span"
      style={{ '--base': mix(from, to, unitCount > 1 ? i / (unitCount - 1) : 0) }}
      sx={{
        display: 'inline-block',
        color: 'var(--base)',
        animation: `${rise} 700ms cubic-bezier(0.2, 0.7, 0.2, 1) ${enterDelay + i * 45}ms both, ${spot} ${cycle}ms ease-in-out ${spotStart + (startIndex + i) * step}ms infinite`,
        ...noMotion,
      }}
    >
      {content}
    </Box>
  )

  return (
    <Box component="span" aria-hidden="true">
      {indexedWords.map(({ parts, offset }, w) => (
        <Fragment key={w}>
          <Box component="span" sx={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {parts.map((part, c) => renderUnit(part, offset + c))}
          </Box>
          {w < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </Box>
  )
}

// A soft beam of light that sweeps across the heading, behind the letters.
export function LightBeam({ totalUnits, byWord = false, delayMs = 0 }) {
  const cycle = totalUnits * (byWord ? WORD_SPOT_STEP_MS : SPOT_STEP_MS) + 2600
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute',
        top: '-12%',
        bottom: '-12%',
        left: 0,
        width: '34%',
        pointerEvents: 'none',
        background: 'radial-gradient(closest-side, rgba(255, 255, 255, 0.3), rgba(124, 240, 192, 0.12) 55%, transparent 100%)',
        filter: 'blur(10px)',
        opacity: 0,
        animation: `${sweep} ${cycle}ms ease-in-out ${delayMs}ms infinite`,
        ...noMotion,
      }}
    />
  )
}
