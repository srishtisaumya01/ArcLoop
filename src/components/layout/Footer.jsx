import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Typography } from '@mui/material'
import Logo from '../ui/Logo.jsx'
import { FOOTER_GROUPS } from '../../constants/navigation.js'
import { colors, contentWidths } from '../../theme/tokens.js'

export default function Footer() {
  return (
    <Box component="footer" sx={{ bgcolor: colors.navy950, color: colors.textOnDark, pt: { xs: 7, md: 9 }, pb: 4 }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 5, md: 6 },
            gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr' },
          }}
        >
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, maxWidth: 340 }}>
            <Logo onDark />
            <Typography sx={{ mt: 2, color: colors.textOnDarkMuted }}>
              Build habits. Keep growing. Consistency over perfection, with friends who have your back.
            </Typography>
          </Box>
          {FOOTER_GROUPS.map((group) => (
            <Box key={group.title} component="nav" aria-label={group.title}>
              <Typography variant="overline" component="h2" sx={{ color: colors.ice400, display: 'block', mb: 2 }}>
                {group.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
                {group.links.map((l) => (
                  <li key={l.label}>
                    <Box
                      component={RouterLink}
                      to={l.to}
                      sx={{ display: 'inline-block', py: { xs: 1.25, md: 0.75 }, color: colors.textOnDarkMuted, textDecoration: 'none', '&:hover': { color: colors.textOnDark, textDecoration: 'underline' } }}
                    >
                      {l.label}
                    </Box>
                  </li>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ mt: 7, pt: 3, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <Typography variant="body2" sx={{ color: colors.textOnDarkMuted }}>
            © {new Date().getFullYear()} Arcloop. Early build: features shown on this site are in development, and sample content is labelled as such.
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}
