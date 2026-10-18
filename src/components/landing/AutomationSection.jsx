import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import AutomationFlow from '../community/AutomationFlow.jsx'
import { ROUTES } from '../../constants/navigation.js'

// The architecture diagram: how the app, the API and the automation fit together to remind and encourage people.
export default function AutomationSection() {
  return (
    <Section id="automation">
      <Reveal>
        <SectionHeading
          eyebrow="Built to keep you going"
          title="Reminders and nudges, running in the background"
          description="When you join a challenge or check in, the Arcloop API raises an event, and automated workflows send the right message at the right time."
        />
      </Reveal>
      <Reveal>
        <AutomationFlow />
      </Reveal>
      <Reveal delay={150}>
        <Button component={RouterLink} to={ROUTES.howItWorks} variant="outlined" color="primary" endIcon={<ArrowRight size={18} />} sx={{ mt: 4 }}>
          See every workflow
        </Button>
      </Reveal>
    </Section>
  )
}
