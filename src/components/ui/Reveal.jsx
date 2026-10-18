import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { motion } from '../../theme/tokens.js'

// Fades and lifts its content in once, the first time it scrolls into view. Without IntersectionObserver (old
// browsers, tests) the content is simply shown, and people who ask for reduced motion never see the movement.
export default function Reveal({ children, delay = 0, as, sx, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (shown) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [shown])

  const transition = `opacity 650ms ${motion.easing} ${delay}ms, transform 650ms ${motion.easing} ${delay}ms`
  return (
    <Box
      ref={ref}
      component={as}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(22px)',
        transition,
        '@media (prefers-reduced-motion: reduce)': { opacity: 1, transform: 'none', transition: 'none' },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  )
}
