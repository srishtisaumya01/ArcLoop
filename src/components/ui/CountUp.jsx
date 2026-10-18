import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useInView } from '../../hooks/useInView.js'

const hidden = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

// A number that counts up from zero the first time it scrolls into view. Screen readers get the final value once,
// not every step on the way; without scrolling or with reduced motion the final value is shown straight away.
export default function CountUp({ value, suffix = '', prefix = '', duration = 1600, decimals = 0 }) {
  const [ref, inView] = useInView({ threshold: 0.4 })
  const startedFinal = useRef(inView)
  const [current, setCurrent] = useState(inView ? value : 0)

  useEffect(() => {
    if (!inView || startedFinal.current) return undefined
    let frame
    let start
    const tick = (now) => {
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      setCurrent(value * (1 - (1 - progress) ** 3))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value, duration])

  const format = (n) => `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
  return (
    <span ref={ref}>
      <span aria-hidden="true">{format(current)}</span>
      <Box component="span" sx={hidden}>
        {format(value)}
      </Box>
    </span>
  )
}
