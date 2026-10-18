import { Box, Typography } from '@mui/material'
import PageHeader from '../../components/common/PageHeader.jsx'
import { Section, SectionHeading } from '../../components/ui/Section.jsx'
import JoinFlow from '../../components/community/JoinFlow.jsx'
import JoinRules from '../../components/community/JoinRules.jsx'
import N8nArchitecture from '../../components/community/N8nArchitecture.jsx'
import AutomationCards from '../../components/community/AutomationCards.jsx'
import FinalCta from '../../components/landing/FinalCta.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { colors } from '../../theme/tokens.js'

export default function HowItWorksPage() {
  usePageMeta('How it works', 'How to join an Arcloop challenge solo, as a friend or as a group, the rules for each, and how n8n automation supports every step.')
  return (
    <>
      <PageHeader
        tone="brand"
        eyebrow="How it works"
        title="From your first log-in to a steady streak"
        description="Pick a challenge, join it solo or with your group, and let automation handle the reminders while you focus on showing up."
      />

      <Section id="journey">
        <SectionHeading
          eyebrow="Your journey"
          title="How joining a challenge works"
          description="Log in, pick a challenge, and choose how to take part. Creating a group asks for each member’s name and username, then the group challenge is created."
        />
        <JoinFlow />
      </Section>

      <Section tone="alt" id="ways-to-join">
        <SectionHeading
          eyebrow="Ways to join"
          title="Join as an individual, a friend or a group"
          description="The challenge rules are the same for everyone. What changes is who you do it with and what you share."
        />
        <JoinRules />
      </Section>

      <Section id="automation">
        <SectionHeading
          eyebrow="Under the hood"
          title="How n8n automation powers each step"
          description="The Arcloop API raises an event when something happens, or n8n runs on a schedule. Each workflow then sends the right message at the right time."
        />
        <N8nArchitecture />
        <Typography variant="h3" component="h3" sx={{ mt: { xs: 6, md: 8 }, mb: 1 }}>
          The workflows, one by one
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 680 }}>
          Each workflow has one trigger and one job. These are planned and not running yet; this page shows how they will work.
        </Typography>
        <AutomationCards />
        <Box sx={{ mt: 3, p: 2.5, borderRadius: '14px', bgcolor: colors.bgAlt, border: `1px dashed ${colors.textMuted}` }}>
          <Typography variant="body2" color="text.secondary">
            Privacy stays the same with automation: messages only use what you already see in Arcloop, and group digests only
            include what each member chose to share.
          </Typography>
        </Box>
      </Section>

      <FinalCta />
    </>
  )
}
