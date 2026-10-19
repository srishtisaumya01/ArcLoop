import { Box } from '@mui/material'
import { colors } from '../../theme/tokens.js'

// The Forest-inspired picture for a focus session: a seed that becomes a sprout, a sapling and a small tree as the time passes.
// It is only a picture of progress (the countdown and the labels carry the facts), so it is hidden from screen readers except for
// one short label. Under "reduce motion" it does not animate: it just shows the stage.
const clamp = (n) => Math.min(1, Math.max(0, n))
const stageLabel = (f) => (f >= 1 ? 'a full tree' : f >= 0.66 ? 'a young tree' : f >= 0.33 ? 'a sapling' : f > 0.02 ? 'a sprout' : 'a seed')

export default function GrowingTree({ fraction, size = 132 }) {
  const f = clamp(fraction)
  const trunkHeight = 6 + 44 * f // grows from a shoot to a trunk
  const crown = 4 + 30 * f // the leafy top
  const groundY = 104
  const topY = groundY - trunkHeight
  return (
    <Box
      role="img"
      aria-label={`Your tree is ${stageLabel(f)}.`}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        '& .tree-part': { transition: 'all 900ms linear' },
        '@media (prefers-reduced-motion: reduce)': { '& .tree-part': { transition: 'none' } },
      }}
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" focusable="false">
        <ellipse cx="60" cy={groundY + 4} rx="38" ry="7" fill={colors.border} />
        <rect className="tree-part" x="57" y={topY} width="6" height={trunkHeight} rx="3" fill="#8A5A3C" />
        {f > 0.02 && <circle className="tree-part" cx="60" cy={topY} r={crown} fill={colors.mint400} />}
        {f > 0.33 && <circle className="tree-part" cx={60 - crown * 0.55} cy={topY + crown * 0.35} r={crown * 0.7} fill={colors.success} opacity="0.85" />}
        {f > 0.33 && <circle className="tree-part" cx={60 + crown * 0.55} cy={topY + crown * 0.35} r={crown * 0.7} fill={colors.success} opacity="0.85" />}
        {f <= 0.02 && <ellipse cx="60" cy={groundY - 2} rx="5" ry="3.5" fill="#8A5A3C" />}
      </svg>
    </Box>
  )
}
