import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import FaqList from '../faq/FaqList.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { FAQ_GROUPS } from '../../constants/faqContent.js'
import { ROUTES } from '../../constants/navigation.js'

// The first few questions, with a link to the full FAQ page.
export default function Faq() {
  const { t } = useI18n()
  const items = FAQ_GROUPS[0].items.slice(0, 4)
  return (
    <Section id="faq" narrow>
      <Reveal>
        <SectionHeading eyebrow={t('FAQ')} title={t('Questions, answered honestly')} align="center" />
      </Reveal>
      <Reveal delay={100}>
        <FaqList items={items} idPrefix="home-faq" />
      </Reveal>
      <Reveal delay={150}>
        <Button component={RouterLink} to={ROUTES.faq} variant="outlined" color="primary" endIcon={<ArrowRight size={18} />} sx={{ mt: 4, display: 'flex', mx: 'auto', width: 'fit-content' }}>
          {t('See all questions')}
        </Button>
      </Reveal>
    </Section>
  )
}
