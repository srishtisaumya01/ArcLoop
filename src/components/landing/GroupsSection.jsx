import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { ArrowRight, Check } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import GroupPlan from './GroupPlan.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { GROUP_POINTS } from '../../constants/landingContent.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, onBrandButtons } from '../../theme/tokens.js'

// Friends and groups: why do a challenge together, and the plan for joining one as a group.
export default function GroupsSection() {
  const { t } = useI18n()
  return (
    <Section tone="dark" id="groups">
      <Box sx={{ display: 'grid', gap: { xs: 6, md: 8 }, alignItems: 'center', gridTemplateColumns: { xs: '1fr', md: '1fr 1.05fr' } }}>
        <Box>
          <Reveal>
            <SectionHeading
              eyebrow={t('Friends and groups')}
              title={t('Take a challenge on together')}
              description={t('Habits stick better with people around you. Create a group for a challenge, add your friends by name and username, and check in side by side, sharing only what you choose.')}
            />
          </Reveal>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, mt: -2 }}>
            {GROUP_POINTS.map((p, i) => (
              <Reveal as="li" key={p} delay={i * 110} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Box sx={{ mt: '3px', color: colors.mint300, flexShrink: 0 }}>
                  <Check size={20} aria-hidden="true" />
                </Box>
                <Typography sx={{ color: colors.textOnDarkMuted }}>{t(p)}</Typography>
              </Reveal>
            ))}
          </Box>
          <Reveal delay={300}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 4 }}>
              <Button component={RouterLink} to={ROUTES.howItWorks} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={onBrandButtons.solid}>
                {t('See how joining works')}
              </Button>
              <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" size="large" sx={onBrandButtons.glass}>
                {t('Browse challenges')}
              </Button>
            </Box>
          </Reveal>
        </Box>

        <Reveal delay={150}>
          <GroupPlan />
        </Reveal>
      </Box>
    </Section>
  )
}
