import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { colors } from '../../theme/tokens.js'

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Types text out letter by letter with a blinking caret. `segments` is [{ text, sx }] so a part (a name) can be styled.
// The full text is always in the page for screen readers and holds its space, so nothing jumps while it types. With reduced
// motion, or while `active` is false, the text is not animated (inactive keeps the space but shows nothing yet).
export default function Typewriter({ segments, active = true, speed = 75 }) {
  const full = segments.map((s) => s.text).join('')
  const [count, setCount] = useState(() => (reducedMotion() ? full.length : 0))

  useEffect(() => {
    if (!active || count >= full.length) return undefined
    const id = setInterval(() => setCount((n) => Math.min(n + 1, full.length)), speed)
    return () => clearInterval(id)
  }, [active, count, full.length, speed])

  const typing = active && count < full.length
  const visible = active ? count : 0
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, x) => sum + x.text.length, 0))
  return (
    <>
      <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{full}</Box>
      <span aria-hidden="true">
        {segments.map((segment, index) => {
          const shown = Math.max(0, Math.min(segment.text.length, visible - starts[index]))
          const caretHere = typing && visible >= starts[index] && visible < starts[index] + segment.text.length
          return (
            <Box key={index} component="span" sx={segment.sx}>
              {segment.text.slice(0, shown)}
              {caretHere && <Box component="span" sx={{ display: 'inline-block', width: '0.08em', height: '0.9em', ml: '0.04em', verticalAlign: '-0.08em', bgcolor: colors.mint300, WebkitTextFillColor: colors.mint300, animation: `${blink} 0.9s steps(1) infinite` }} />}
              <Box component="span" sx={{ visibility: 'hidden' }}>{segment.text.slice(shown)}</Box>
            </Box>
          )
        })}
      </span>
    </>
  )
}
