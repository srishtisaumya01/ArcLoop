import { Box, Typography } from '@mui/material'
import PageHeader from '../../components/common/PageHeader.jsx'
import { Section, SectionHeading } from '../../components/ui/Section.jsx'
import Reveal from '../../components/ui/Reveal.jsx'
import JoinFlow from '../../components/community/JoinFlow.jsx'
import JoinRules from '../../components/community/JoinRules.jsx'
import AutomationFlow from '../../components/community/AutomationFlow.jsx'
import AutomationCards from '../../components/community/AutomationCards.jsx'
import FinalCta from '../../components/landing/FinalCta.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { colors } from '../../theme/tokens.js'

export default function HowItWorksPage() {
  const { t } = useI18n()
  usePageMeta(t('How it works'), t('How to join an Arcloop challenge solo, as a friend or as a group, the rules for each, and how automation supports every step.'))
  return (
    <>
      <PageHeader
        tone="brand"
        eyebrow={t('How it works')}
        title={t('From your first log-in to a steady streak')}
        description={t('Pick a challenge, join it solo or with your group, and let automation handle the reminders while you focus on showing up.')}
      />

      <Section id="journey">
        <Reveal>
          <SectionHeading
            eyebrow={t('Your journey')}
            title={t('How joining a challenge works')}
            description={t('Log in, pick a challenge, and choose how to take part. Creating a group asks for each member’s name and username, then the group challenge is created.')}
          />
        </Reveal>
        <JoinFlow>
          <JoinRules />
        </JoinFlow>
      </Section>

      <Section tone="alt" id="automation">
        <Reveal>
          <SectionHeading
            eyebrow={t('Under the hood')}
            title={t('How automation powers each step')}
            description={t('Arcloop raises an event when something happens, or the system runs on a schedule. Each workflow then sends the right message at the right time.')}
          />
        </Reveal>
        <Reveal>
          <AutomationFlow />
        </Reveal>
        <Reveal>
          <Typography variant="h3" component="h3" sx={{ mt: { xs: 6, md: 8 }, mb: 1 }}>
            {t('The workflows, one by one')}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 680 }}>
            {t('Each workflow has one trigger and one job. These are planned and not running yet; this page shows how they will work.')}
          </Typography>
        </Reveal>
        <AutomationCards />
        <Reveal>
          <Box sx={{ mt: 3, p: 2.5, borderRadius: '14px', bgcolor: colors.surface, border: `1px dashed ${colors.textMuted}` }}>
            <Typography variant="body2" color="text.secondary">
              {t('Privacy stays the same with automation: messages only use what you already see in Arcloop, and group digests only include what each member chose to share.')}
            </Typography>
          </Box>
        </Reveal>
      </Section>

      <FinalCta />
    </>
  )
}
