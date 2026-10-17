import { Box, Typography } from '@mui/material'
import { CircleCheck, Sprout, Users } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import { HOW_IT_WORKS } from '../../constants/landingContent.js'
import { colors } from '../../theme/tokens.js'

const ICONS = { sprout: Sprout, check: CircleCheck, users: Users }

export default function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="Three simple steps to a steadier you"
        description="No complicated setup. Start with one habit and build from there."
      />
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {HOW_IT_WORKS.map((step, i) => {
          const Icon = ICONS[step.icon]
          return (
            <Box component="li" key={step.title} sx={{ position: 'relative', pt: 3, borderTop: `2px solid ${colors.navy900}` }}>
              <Typography variant="overline" component="p" sx={{ color: colors.blue600, mb: 2, display: 'block' }}>
                Step {i + 1}
              </Typography>
              <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: colors.navy900, color: colors.ice400, mb: 2.5 }}>
                <Icon size={24} aria-hidden="true" />
              </Box>
              <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
                {step.title}
              </Typography>
              <Typography color="text.secondary">{step.text}</Typography>
            </Box>
          )
        })}
      </Box>
    </Section>
  )
}
