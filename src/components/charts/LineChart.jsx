import { useEffect, useRef, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { chart, colors } from '../../theme/tokens.js'

// Rounds the top of the y-axis up to a clean step (1, 2, 2.5 or 5 x 10^n) with about four intervals.
function niceScale(maxValue, intervals = 4) {
  const rough = maxValue / intervals
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  return { max: Math.ceil(maxValue / step) * step, step }
}

function useWidth(ref, fallback = 640) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * Line chart with a hover/keyboard crosshair, a legend for two or more series, labelled line ends and a table view.
 * `series`: [{ key, label, color, values }], one value per entry in `labels`.
 */
export default function LineChart({ series, labels, yMin = 0, yMax, yStep, format = String, area = false, height = 280, ariaLabel }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [active, setActive] = useState(null)

  const narrow = width < 520
  const margin = { top: 16, right: narrow ? 56 : 104, bottom: 30, left: 44 }
  const dataMax = Math.max(...series.flatMap((s) => s.values))
  const auto = niceScale(dataMax - yMin)
  const top = yMax ?? yMin + auto.max
  const step = yStep ?? auto.step
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const n = labels.length
  const x = (i) => margin.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v) => margin.top + innerH * (1 - (v - yMin) / (top - yMin))

  const ticks = []
  for (let t = yMin; t <= top + 1e-9; t += step) ticks.push(t)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 44))))

  // Line-end labels, nudged apart when two ends land within 18px of each other.
  const ends = series
    .map((s) => ({ key: s.key, label: s.label, value: s.values[n - 1], y: y(s.values[n - 1]) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i += 1) {
    if (ends[i].y - ends[i - 1].y < 18) ends[i].y = ends[i - 1].y + 18
  }

  const pickIndex = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) * width) / rect.width
    const i = Math.round(((px - margin.left) / innerW) * (n - 1))
    setActive(Math.min(n - 1, Math.max(0, i)))
  }
  const onKeyDown = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1 }
    if (event.key in moves) {
      event.preventDefault()
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + moves[event.key])))
    } else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(n - 1)
    else if (event.key === 'Escape') setActive(null)
  }

  const tooltipLeft = active === null ? 0 : x(active)
  const flip = tooltipLeft > width - 200

  return (
    <Box>
      {series.length > 1 && (
        <Box component="ul" aria-label="Legend" sx={{ listStyle: 'none', m: 0, mb: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
          {series.map((s) => (
            <Box component="li" key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box aria-hidden="true" sx={{ width: 18, height: 3, borderRadius: 2, bgcolor: s.color }} />
              <Typography variant="body2" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Box ref={wrapRef} sx={{ position: 'relative', width: '100%' }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onPointerMove={pickIndex}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y', borderRadius: 8 }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke={chart.grid} strokeWidth={1} />
              <text x={margin.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={colors.textMuted}>
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={l} x={x(i)} y={height - 8} textAnchor="middle" fontSize={12} fill={colors.textMuted}>
                {l}
              </text>
            ) : null,
          )}

          {series.map((s) => {
            const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
            return (
              <g key={s.key}>
                {area && <path d={`${d} L${x(n - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z`} fill={s.color} opacity={0.1} />}
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r={5} fill={s.color} stroke={chart.surface} strokeWidth={2} />
              </g>
            )
          })}

          {ends.map((e) => (
            <text key={e.key} x={x(n - 1) + 12} y={e.y} dy="0.32em" fontSize={13} fill={colors.textPrimary} fontWeight={700}>
              {format(e.value)}
              {!narrow && series.length > 1 && (
                <tspan fill={colors.textSecondary} fontWeight={500}>
                  {` ${e.label.split(' ')[0]}`}
                </tspan>
              )}
            </text>
          ))}

          {active !== null && (
            <g aria-hidden="true">
              <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + innerH} stroke={colors.textMuted} strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(active)} cy={y(s.values[active])} r={5} fill={s.color} stroke={chart.surface} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>

        {active !== null && (
          <Box
            role="status"
            aria-live="polite"
            sx={{
              position: 'absolute',
              top: margin.top,
              left: tooltipLeft,
              transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
              bgcolor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(11, 27, 58, 0.14)',
              px: 1.5,
              py: 1,
              minWidth: 150,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              {labels[active]}
            </Typography>
            {series.map((s) => (
              <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: colors.textSecondary, flex: 1 }}>
                  {s.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {format(s.values[active])}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box component="details" sx={{ mt: 1.5, '& summary': { cursor: 'pointer', color: colors.blue600, fontWeight: 600, fontSize: '0.875rem', width: 'fit-content' } }}>
        <summary>View as table</summary>
        <Box sx={{ overflowX: 'auto', mt: 1.5 }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: 240, '& th, & td': { textAlign: 'left', py: 0.75, pr: 3, borderBottom: `1px solid ${colors.border}` } }}>
            <thead>
              <tr>
                <th scope="col">Week</th>
                {series.map((s) => (
                  <th scope="col" key={s.key}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l}>
                  <th scope="row">{l}</th>
                  {series.map((s) => (
                    <td key={s.key}>{format(s.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
