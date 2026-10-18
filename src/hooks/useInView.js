import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// True once the element has scrolled into view (and stays true). Without IntersectionObserver, or for people who ask for
// reduced motion, it is true from the start so nothing waits for a scroll that animates nothing.
export function useInView({ threshold = 0.25 } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion())

  useEffect(() => {
    if (inView || !ref.current) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [inView, threshold])

  return [ref, inView]
}
