import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Container, InputAdornment, TextField, Typography } from '@mui/material'
import { Mail, Search, SearchX } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import FaqList from '../../components/faq/FaqList.jsx'
import Reveal from '../../components/ui/Reveal.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { FAQ_GROUPS } from '../../constants/faqContent.js'
import { ROUTES } from '../../constants/navigation.js'
import { SITE_CONFIG } from '../../constants/siteConfig.js'
import { colors, contentWidths, gradients, radii, shadows } from '../../theme/tokens.js'

export default function FaqPage() {
  const { t } = useI18n()
  usePageMeta(t('FAQ'), t('Answers about joining challenges, groups, reminders, privacy and using Arcloop.'))
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()

  const groups = useMemo(
    () =>
      FAQ_GROUPS.map((g) => ({
        ...g,
        items: needle ? g.items.filter((f) => `${t(f.q)} ${t(f.a)}`.toLowerCase().includes(needle)) : g.items,
      })).filter((g) => g.items.length > 0),
    [needle, t],
  )
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <>
      <PageHeader
        eyebrow={t('FAQ')}
        title={t('Frequently asked questions')}
        description={t('Everything about joining a challenge, groups, reminders and privacy, answered plainly.')}
      />

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Box sx={{ display: 'grid', gap: { xs: 4, md: 7 }, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '240px minmax(0, 1fr)' }, alignItems: 'start' }}>
          <Box component="nav" aria-label={t('Topics')} sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 120 }}>
            <Typography variant="overline" component="p" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
              {t('Topics')}
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
              {FAQ_GROUPS.map((g) => (
                <li key={g.id}>
                  <Box component="a" href={`#${g.id}`} sx={{ display: 'block', px: 1.5, py: 1, borderRadius: 2, color: colors.textSecondary, fontWeight: 600, textDecoration: 'none', '&:hover': { color: colors.textPrimary, bgcolor: colors.bgAlt } }}>
                    {t(g.title)}
                  </Box>
                </li>
              ))}
            </Box>
          </Box>

          <Box>
            <Box component="form" role="search" aria-label={t('Search the FAQ')} onSubmit={(e) => e.preventDefault()} sx={{ mb: 1.5 }}>
              <TextField
                id="faq-search"
                type="search"
                fullWidth
                label={t('Search questions')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }}
              />
            </Box>
            <Typography role="status" aria-live="polite" color="text.secondary" sx={{ mb: 4 }}>
              {t('Showing {count} questions', { count: total })}
            </Typography>

            {total === 0 && (
              <StatePanel
                icon={SearchX}
                title={t('No questions match your search')}
                text={t('Try a different word, or clear the search to see everything.')}
                action={<Button variant="outlined" color="primary" onClick={() => setQuery('')}>{t('Clear search')}</Button>}
              />
            )}

            {groups.map((g) => (
              <Box key={g.id} component="section" id={g.id} aria-labelledby={`${g.id}-title`} sx={{ mb: 6, scrollMarginTop: '120px' }}>
                <Reveal>
                  <Typography variant="h3" component="h2" id={`${g.id}-title`} sx={{ mb: 1 }}>
                    {t(g.title)}
                  </Typography>
                </Reveal>
                <FaqList items={g.items} idPrefix={g.id} />
              </Box>
            ))}

            <Reveal>
              <Card sx={{ mt: 2, border: 'none', background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.lg, borderRadius: `${radii.lg}px` }}>
                <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', gap: 3, alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' }, textAlign: { xs: 'center', sm: 'left' } }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h3" component="p" sx={{ mb: 0.5 }}>
                      {t('Still have a question?')}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255, 255, 255, 0.86)' }}>
                      {t('Write to us and we will get back to you.')} {SITE_CONFIG.supportEmail}
                    </Typography>
                  </Box>
                  <Button component={RouterLink} to={ROUTES.contact} variant="contained" size="large" startIcon={<Mail size={18} aria-hidden="true" />} sx={{ bgcolor: '#fff', color: colors.navy900, flexShrink: 0, '&:hover': { bgcolor: colors.ice300 } }}>
                    {t('Get in touch')}
                  </Button>
                </CardContent>
              </Card>
            </Reveal>
          </Box>
        </Box>
      </Container>
    </>
  )
}
