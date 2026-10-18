import { useState } from 'react'
import { Box, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Sparkles, Trophy } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n.js'
import { colors, radii, shadows } from '../../theme/tokens.js'

// How many challenges the person has made and how many Arcloop (arc) challenges they joined, all of them or only solo or group.
export default function ChallengeCounts({ status, items }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('all')
  if (status === 'loading') return <Skeleton variant="rounded" height={190} />
  const shown = filter === 'all' ? items : items.filter((c) => c.enrollment.mode === filter)
  const created = shown.filter((c) => c.kind === 'custom').length
  const arc = shown.filter((c) => c.kind === 'official').length
  const tiles = [
    [t('Created by you'), created, Sparkles],
    [t('Arc challenges joined'), arc, Trophy],
  ]
  return (
    <Box sx={{ p: 2.5, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, boxShadow: shadows.sm, display: 'grid', gap: 1.5, alignContent: 'start' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h2">{t('Your challenges')}</Typography>
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, value) => value && setFilter(value)} aria-label={t('Filter challenges')}>
          <ToggleButton value="all">{t('All')}</ToggleButton>
          <ToggleButton value="solo">{t('Solo')}</ToggleButton>
          <ToggleButton value="group">{t('Group')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {tiles.map(([label, count, Icon]) => (
          <Box key={label} sx={{ p: 2, borderRadius: `${radii.md}px`, background: 'linear-gradient(135deg, #D2E2F8 0%, #CBE9EE 50%, #C4EBD7 100%)', color: '#0B1B3A' }}>
            <Icon size={20} aria-hidden="true" />
            <Typography component="p" sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1, mt: 0.5 }}>{count}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
