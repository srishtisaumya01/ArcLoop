import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useInView } from '../../hooks/useInView.js'
import { useI18n } from '../../hooks/useI18n.js'
import { toLocalDate } from '../../utils/dashboard.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, gradients } from '../../theme/tokens.js'

const BAR_MAX = 96

// Seven days, each a bar: how much of that day's plan was done, or how much is planned for a day to come.
export default function WeekCard({ bars, weekStart, weekEnd }) {
  const { t, lang } = useI18n()
  const [ref, grown] = useInView({ threshold: 0.3 })
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const range = weekStart && weekEnd ? `${short.format(toLocalDate(weekStart))} – ${short.format(toLocalDate(weekEnd))}` : ''

  return (
    <Reveal sx={{ height: '100%' }} delay={100}>
      <Card sx={{ height: '100%' }}>
        <CardContent ref={ref} sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h4" component="h2">
              {t('This week')}
            </Typography>
            {range && (
              <Typography variant="body2" color="text.secondary">
                {range}
              </Typography>
            )}
          </Box>

          <Box component="ol" aria-label={t('Days of this week')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1.25 }, alignItems: 'end', flex: 1 }}>
            {bars.map((b) => {
              const height = b.percent !== null ? Math.max(8, Math.round((b.percent / 100) * BAR_MAX)) : b.isRest ? 14 : b.planned > 0 ? 24 : 6
              const label = b.percent !== null ? `${b.percent}%` : b.isRest ? t('Rest') : b.planned > 0 ? t('{count} planned', { count: b.planned }) : '–'
              const date = toLocalDate(b.date)
              return (
                <Box component="li" key={b.date} sx={{ textAlign: 'center' }}>
                  <Box
                    component={RouterLink}
                    to={`${ROUTES.day}?date=${b.date}`}
                    aria-label={`${weekday.format(date)} ${short.format(date)}: ${label}`}
                    sx={{ display: 'block', textDecoration: 'none', color: 'inherit', borderRadius: '10px', p: 0.5, outline: b.isToday ? `2px solid ${colors.blue600}` : 'none', outlineOffset: 1, '&:hover .week-bar': { filter: 'brightness(1.08)' } }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700, minHeight: 20, color: colors.textSecondary, fontSize: '0.75rem' }}>
                      {b.percent !== null ? `${b.percent}%` : ''}
                    </Typography>
                    <Box sx={{ height: BAR_MAX, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Box
                        className="week-bar"
                        sx={{
                          width: '70%',
                          maxWidth: 40,
                          height: grown ? height : 0,
                          borderRadius: '8px 8px 4px 4px',
                          background: b.percent !== null ? gradients.brand : 'transparent',
                          bgcolor: b.percent !== null ? undefined : b.isRest ? colors.bgAlt : colors.border,
                          border: b.percent === null && b.planned > 0 ? `2px dashed ${colors.blue600}` : 'none',
                          transition: 'height 900ms cubic-bezier(0.2, 0.7, 0.2, 1)',
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ mt: 0.75, fontWeight: b.isToday ? 800 : 600, color: b.isToday ? colors.blue600 : colors.textSecondary }}>
                      {weekday.format(date)}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>

          <Box sx={{ mt: 2.5 }}>
            <Button component={RouterLink} to={ROUTES.week} variant="outlined" color="primary" size="small" endIcon={<ArrowRight size={16} aria-hidden="true" />}>
              {t('Open your week')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Reveal>
  )
}
