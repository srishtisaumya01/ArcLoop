import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import ChartCard from '../charts/ChartCard.jsx'
import LineChart from '../charts/LineChart.jsx'
import { AUTOMATION_IMPACT, AUTOMATION_WEEKS, COMMUNITY_GROWTH, WEEK_LABELS } from '../../constants/communityDemo.js'
import { ROUTES } from '../../constants/navigation.js'
import { chart, colors, gradients, onBrandButtons, radii, shadows } from '../../theme/tokens.js'

const compact = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(v))

// Two charts that show people stick with it: growth in active participants, and how reminders keep consistency up.
export default function MomentumSection() {
  return (
    <Section tone="alt" id="momentum">
      <Reveal>
        <SectionHeading
          eyebrow="Momentum"
          title="People who start together keep going"
          description="More people join every week, and the ones who get a gentle reminder keep far more of their scheduled days. Here is what that looks like."
        />
      </Reveal>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start' }}>
        <Reveal sx={{ minWidth: 0 }}>
          <ChartCard title="Active participants per week" subtitle="Grew from 120 to 1,010 over 12 weeks">
            <LineChart
              ariaLabel="Line chart of active participants per week over 12 weeks, rising steadily from 120 in week 1 to 1,010 in week 12."
              labels={WEEK_LABELS}
              series={[{ key: 'active', label: 'Active participants', color: chart.series1, values: COMMUNITY_GROWTH }]}
              format={compact}
              area
            />
          </ChartCard>
        </Reveal>
        <Reveal delay={140} sx={{ minWidth: 0 }}>
          <ChartCard title="Consistency with and without reminders" subtitle="Average share of scheduled check-ins kept, by week since joining">
            <LineChart
              ariaLabel="Line chart of weekly consistency over 8 weeks. With reminders and nudges it rises from 62% to 79%. Without them it falls from 58% to 49%."
              labels={AUTOMATION_WEEKS}
              yMin={40}
              yMax={90}
              yStep={10}
              format={(v) => `${v}%`}
              series={[
                { key: 'with', label: 'With nudges', color: chart.series1, values: AUTOMATION_IMPACT.withNudges },
                { key: 'without', label: 'Without nudges', color: chart.series2, values: AUTOMATION_IMPACT.withoutNudges },
              ]}
            />
          </ChartCard>
        </Reveal>
      </Box>

      <Reveal delay={120}>
        <Box
          sx={{
            mt: { xs: 4, md: 5 },
            p: { xs: 3, md: 4 },
            borderRadius: `${radii.lg}px`,
            background: gradients.brand,
            color: colors.textOnDark,
            boxShadow: shadows.lg,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            flexDirection: { xs: 'column', md: 'row' },
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.16)' }}>
            <Sparkles size={28} aria-hidden="true" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3" component="p" sx={{ mb: 0.5 }}>
              Your next arc is easier with company.
            </Typography>
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.86)' }}>Pick a challenge, bring a friend, and let the reminders do the remembering.</Typography>
          </Box>
          <Button component={RouterLink} to={ROUTES.challenges} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={{ ...onBrandButtons.solid, flexShrink: 0 }}>
            Join the momentum
          </Button>
        </Box>
      </Reveal>
    </Section>
  )
}
