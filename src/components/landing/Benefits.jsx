import { Box, Card, CardContent, Typography } from '@mui/material'
import { CalendarDays, Heart, Repeat, ShieldCheck } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { BENEFITS } from '../../constants/landingContent.js'
import { colors, shadows } from '../../theme/tokens.js'

const ICONS = { repeat: Repeat, calendar: CalendarDays, heart: Heart, shield: ShieldCheck }

export default function Benefits() {
  const { t } = useI18n()
  return (
    <Section tone="alt" id="benefits">
      <SectionHeading
        eyebrow={t('Built for consistency')}
        title={t('Progress you can actually see')}
        description={t('Meaningful progress instead of vanity metrics: what you did, how often, and where you are heading.')}
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
        {BENEFITS.map((b, i) => {
          const Icon = ICONS[b.icon]
          return (
            <Reveal key={b.title} delay={i * 110} sx={{ height: '100%' }}>
            <Card sx={{ height: '100%', '&:hover': { boxShadow: shadows.md, transform: 'translateY(-4px)' } }}>
              <CardContent sx={{ p: 3.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: colors.bgAlt, color: colors.blue600, mb: 2.5 }}>
                  <Icon size={22} aria-hidden="true" />
                </Box>
                <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
                  {t(b.title)}
                </Typography>
                <Typography color="text.secondary">{t(b.text)}</Typography>
              </CardContent>
            </Card>
            </Reveal>
          )
        })}
      </Box>
    </Section>
  )
}
