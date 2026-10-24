import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Typography } from '@mui/material'
import { ArrowRight, CalendarCheck, Flame, UserRound, Users } from 'lucide-react'
import AttendanceDialog from './AttendanceDialog.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { appChallengePath } from '../../constants/navigation.js'
import { formatDate } from '../../utils/appDates.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

// One challenge the person is in: where it stands today, its dates, and whether they do it alone or with friends.
export default function MyChallengeCard({ item }) {
  const { t, lang } = useI18n()
  const { clock, enrollment } = item
  const [marking, setMarking] = useState(false)
  const markedToday = enrollment.attended.includes(enrollment.today)
  const group = enrollment.group
  const standing =
    clock.status === 'live' ? t('Day {day} of {total}', { day: clock.dayNumber, total: clock.totalDays }) : clock.status === 'upcoming' ? t('Starts {date}', { date: formatDate(enrollment.start_date, lang) }) : t('Finished')
  return (
    <Box sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.md, display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.mint300, fontWeight: 700 }}>
        <Flame size={18} aria-hidden="true" />
        <Typography component="span" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{t(item.title)}</Typography>
      </Box>
      <Typography component="p" sx={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.15 }}>{standing}</Typography>
      <Box aria-hidden="true" sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255, 255, 255, 0.22)', overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.round(clock.progress * 100)}%`, height: '100%', borderRadius: 4, background: gradients.accentText }} />
      </Box>
      <Typography sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
        {formatDate(enrollment.start_date, lang)} – {formatDate(enrollment.end_date, lang)}
        {clock.status === 'live' && ` · ${clock.daysLeft === 0 ? t('Last day today') : t('{count} days left', { count: clock.daysLeft })}`}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip size="small" icon={group ? <Users size={14} /> : <UserRound size={14} />} label={group ? t('Group · {count} people', { count: group.members.length + 1 }) : t('Solo')} sx={{ color: '#FFFFFF', bgcolor: 'rgba(255, 255, 255, 0.16)', '& .MuiChip-icon': { color: 'inherit' } }} />
        {group?.members.map((m) => (
          <Chip key={m.username} size="small" variant="outlined" label={`@${m.username}${m.joined ? '' : ` · ${t('invited')}`}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.5)' }} />
        ))}
      </Box>
      <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>{t('Attended {done} of {total} days', { done: enrollment.attended.length, total: clock.totalDays })}</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {clock.status === 'live' && (
          <Button variant="contained" size="small" startIcon={<CalendarCheck size={16} aria-hidden="true" />} onClick={() => setMarking(true)} sx={{ bgcolor: markedToday ? colors.mint300 : '#FFFFFF', color: '#0B1B3A', '&:hover': { bgcolor: '#EAF1FF' } }}>
            {markedToday ? t('Attended today') : t('Mark attendance')}
          </Button>
        )}
        <Button component={RouterLink} to={appChallengePath(item.slug)} variant="contained" size="small" endIcon={<ArrowRight size={16} aria-hidden="true" />} sx={{ bgcolor: '#FFFFFF', color: '#0B1B3A', '&:hover': { bgcolor: '#EAF1FF' } }}>
          {t('View challenge')}
        </Button>
      </Box>
      {marking && <AttendanceDialog item={item} open onClose={() => setMarking(false)} />}
    </Box>
  )
}
