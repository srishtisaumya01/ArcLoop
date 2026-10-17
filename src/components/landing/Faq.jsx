import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material'
import { ChevronDown } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import { FAQS } from '../../constants/landingContent.js'
import { colors } from '../../theme/tokens.js'

export default function Faq() {
  return (
    <Section tone="alt" id="faq" narrow>
      <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" align="center" />
      <div>
        {FAQS.map((f, i) => (
          <Accordion key={f.q} sx={{ '&:first-of-type': { borderTop: `1px solid ${colors.border}` } }}>
            <AccordionSummary
              expandIcon={<ChevronDown size={22} aria-hidden="true" />}
              aria-controls={`faq-${i}-content`}
              id={`faq-${i}-header`}
              sx={{ px: 0, py: 1, minHeight: 64 }}
            >
              <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>
                {f.q}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0, pb: 3 }}>
              <Typography color="text.secondary">{f.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </div>
    </Section>
  )
}
