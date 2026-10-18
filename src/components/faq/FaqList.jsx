import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n.js'
import { colors } from '../../theme/tokens.js'

// A list of questions that open to show their answers. Used on the FAQ page and in the short list on the home page.
export default function FaqList({ items, idPrefix = 'faq' }) {
  const { t } = useI18n()
  return (
    <div>
      {items.map((f, i) => (
        <Accordion key={f.q} sx={{ '&:first-of-type': { borderTop: `1px solid ${colors.border}` } }}>
          <AccordionSummary
            expandIcon={<ChevronDown size={22} aria-hidden="true" />}
            aria-controls={`${idPrefix}-${i}-content`}
            id={`${idPrefix}-${i}-header`}
            sx={{ px: 0, py: 1, minHeight: 64 }}
          >
            {/* MUI already wraps the summary in a heading (h3); this is only its text. */}
            <Typography component="span" sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>
              {t(f.q)}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0, pb: 3 }}>
            <Typography color="text.secondary">{t(f.a)}</Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  )
}
