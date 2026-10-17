import { Alert, Box, Container, Typography } from '@mui/material'
import PageHeader from './PageHeader.jsx'
import { SITE_CONFIG, configured } from '../../constants/siteConfig.js'
import { colors, contentWidths } from '../../theme/tokens.js'

const LABELS = {
  legalEntityName: 'Legal entity name',
  supportEmail: 'Support email',
  governingLaw: 'Governing law',
  legalLastUpdated: 'Date set on publication',
}

// Replaces {{key}} placeholders with configured values, or a visible marker.
function fill(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => configured(SITE_CONFIG[key], LABELS[key] ?? key))
}

export default function LegalDocument({ doc }) {
  return (
    <>
      <PageHeader eyebrow="Draft for review" title={doc.title} description={doc.intro} />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Alert severity="warning" variant="outlined" sx={{ mb: 5, maxWidth: contentWidths.narrow }}>
          This is a draft. It has not been reviewed by a lawyer, is not legally binding, and may not match how the product works yet. Items marked “Update after backend integration” must be confirmed before launch.
        </Alert>
        <Box sx={{ display: 'grid', gap: 6, gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr)' }, alignItems: 'start' }}>
          <Box component="nav" aria-label="On this page" sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 96 }}>
            <Typography variant="overline" component="p" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
              On this page
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <Box component="a" href={`#${s.id}`} sx={{ display: 'block', py: 0.75, color: colors.textSecondary, textDecoration: 'none', fontSize: '0.9375rem', '&:hover': { color: colors.blue600, textDecoration: 'underline' } }}>
                    {s.title}
                  </Box>
                </li>
              ))}
            </Box>
          </Box>
          <Box sx={{ maxWidth: contentWidths.narrow }}>
            {doc.sections.map((s) => (
              <Box component="section" key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} sx={{ mb: 5, scrollMarginTop: '96px' }}>
                <Typography variant="h3" component="h2" id={`${s.id}-title`} sx={{ mb: 1.5 }}>
                  {s.title}
                </Typography>
                {s.update && (
                  <Typography variant="body2" sx={{ color: colors.warning, fontWeight: 700, mb: 1.5 }}>
                    Update after backend integration
                  </Typography>
                )}
                {s.paragraphs?.map((p) => (
                  <Typography key={p} color="text.secondary" sx={{ mb: 1.5 }}>
                    {fill(p)}
                  </Typography>
                ))}
                {s.list && (
                  <Box component="ul" sx={{ pl: 3, m: 0, color: 'text.secondary', display: 'grid', gap: 0.75 }}>
                    {s.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </>
  )
}
