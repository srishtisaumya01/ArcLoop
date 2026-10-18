import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import Reveal from '../ui/Reveal.jsx'
import AutomationFlow from '../community/AutomationFlow.jsx'
import { ROUTES } from '../../constants/navigation.js'

// The architecture diagram: how the app, the API and the automation fit together to remind and encourage people.
export default function AutomationSection() {
  const { t } = useI18n()
  return (
    <Section id="automation">
      <Reveal>
        <SectionHeading
          eyebrow={t('Built to keep you going')}
          title={t('Reminders and nudges, running in the background')}
          description={t('When you join a challenge or check in, Arcloop raises an event, and automated workflows send the right message at the right time.')}
        />
      </Reveal>
      <Reveal>
        <AutomationFlow />
      </Reveal>
      <Reveal delay={150}>
        <Button component={RouterLink} to={ROUTES.howItWorks} variant="outlined" color="primary" endIcon={<ArrowRight size={18} />} sx={{ mt: 4 }}>
          {t('See every workflow')}
        </Button>
      </Reveal>
    </Section>
  )
}
