import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Link, Typography } from '@mui/material'
import { Mail } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { FOOTER_GROUPS } from '../../constants/navigation.js'
import { SITE_CONFIG } from '../../constants/siteConfig.js'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

const linkColor = 'rgba(255, 255, 255, 0.9)'

// The footer on every page: the same brand gradient as the home page, with the full logo and the contact email.
export default function Footer() {
  const { t } = useI18n()
  return (
    <Box
      component="footer"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        background: gradients.footer,
        color: colors.textOnDark,
        pt: { xs: 7, md: 9 },
        pb: 4,
        borderTopLeftRadius: { xs: 24, md: 40 },
        borderTopRightRadius: { xs: 24, md: 40 },
      }}
    >
      <Box aria-hidden="true" sx={{ position: 'absolute', right: -120, top: -140, width: 380, height: 380, borderRadius: '50%', bgcolor: 'rgba(124, 240, 192, 0.14)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      <Container sx={{ position: 'relative', maxWidth: `${contentWidths.page}px !important` }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 5, md: 6 },
            gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr' },
          }}
        >
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, maxWidth: 360 }}>
            <Logo onDark size={44} />
            <Typography sx={{ mt: 2, color: linkColor }}>
              {t('Build habits. Keep growing. Consistency over perfection, with friends who have your back.')}
            </Typography>
            <Link
              href={`mailto:${SITE_CONFIG.supportEmail}`}
              sx={{ mt: 2, display: 'inline-flex', alignItems: 'center', gap: 1, color: colors.textOnDark, fontWeight: 600, textDecorationColor: 'rgba(255, 255, 255, 0.5)', '&:hover': { color: colors.mint300 } }}
            >
              <Mail size={18} aria-hidden="true" />
              {SITE_CONFIG.supportEmail}
            </Link>
          </Box>
          {FOOTER_GROUPS.map((group) => (
            <Box key={group.title} component="nav" aria-label={t(group.title)}>
              <Typography variant="overline" component="h2" sx={{ color: colors.mint300, display: 'block', mb: 2 }}>
                {t(group.title)}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
                {group.links.map((l) => (
                  <li key={l.label}>
                    <Box
                      component={RouterLink}
                      to={l.to}
                      sx={{ display: 'inline-block', py: { xs: 1.25, md: 0.75 }, color: linkColor, textDecoration: 'none', '&:hover': { color: colors.textOnDark, textDecoration: 'underline' } }}
                    >
                      {t(l.label)}
                    </Box>
                  </li>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ mt: 7, pt: 3, borderTop: '1px solid rgba(255,255,255,0.22)' }}>
          <Typography variant="body2" sx={{ color: linkColor }}>
            © {new Date().getFullYear()} Arcloop. {t('Early build: features shown on this site are in development, and sample content is labelled as such.')}
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}
