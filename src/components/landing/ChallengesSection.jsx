import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { Section, SectionHeading } from '../ui/Section.jsx'
import DemoBadge from '../ui/DemoBadge.jsx'
import ChallengeCard from '../challenges/ChallengeCard.jsx'
import FeaturedChallengeCard from '../challenges/FeaturedChallengeCard.jsx'
import { FEATURED_CHALLENGE, LANDING_SAMPLE_CHALLENGES } from '../../constants/landingContent.js'
import { ROUTES } from '../../constants/navigation.js'

export default function ChallengesSection() {
  return (
    <Section tone="alt" id="challenges">
      <SectionHeading
        eyebrow="Challenges"
        title="Join a campaign. Create your own challenge soon."
        description="Winter Arc 90 is where we begin. The challenge system is designed to be configurable, so other campaigns and custom challenges can follow."
      />
      <Box sx={{ mb: 6 }}>
        <FeaturedChallengeCard challenge={FEATURED_CHALLENGE} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h3" component="h3">
          Custom challenges, previewed
        </Typography>
        <DemoBadge label="Sample challenges" />
      </Box>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {LANDING_SAMPLE_CHALLENGES.map((c, i) => (
          <ChallengeCard key={c.slug} challenge={c} showActions={false} delay={i * 120} />
        ))}
      </Box>
      <Box sx={{ mt: 4 }}>
        <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" color="primary" size="large">
          Explore all challenges
        </Button>
      </Box>
    </Section>
  )
}
