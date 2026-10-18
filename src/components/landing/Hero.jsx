import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import ProductPreview from './ProductPreview.jsx'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { drift, enter, noMotion } from '../../theme/animations.js'
import { colors, contentWidths, gradients, navOuterHeight, onBrandButtons } from '../../theme/tokens.js'

// Soft coloured glows that drift slowly behind the hero. Purely decorative.
function Glows() {
  const glow = { position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none', ...noMotion }
  return (
    <Box aria-hidden="true">
      <Box sx={{ ...glow, top: '8%', left: '-6%', width: 420, height: 420, bgcolor: 'rgba(77, 176, 234, 0.35)', animation: `${drift} 16s ease-in-out infinite alternate` }} />
      <Box sx={{ ...glow, bottom: '-10%', right: '4%', width: 460, height: 460, bgcolor: 'rgba(46, 214, 139, 0.32)', animation: `${drift} 20s ease-in-out -6s infinite alternate` }} />
    </Box>
  )
}

export default function Hero() {
  return (
    <Box
      component="section"
      aria-labelledby="hero-title"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        mt: `-${navOuterHeight}px`,
        pt: { xs: `${navOuterHeight + 40}px`, md: `${navOuterHeight + 88}px` },
        pb: { xs: 12, md: 22 },
        background: gradients.brand,
        color: colors.textOnDark,
      }}
    >
      <Glows />
      <Container sx={{ position: 'relative', maxWidth: `${contentWidths.page}px !important` }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 6, md: 8 },
            alignItems: 'center',
            gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          }}
        >
          <Box>
            <Typography variant="overline" component="p" sx={{ color: colors.mint300, mb: 2, display: 'block', ...enter(0, 700) }}>
              Winter Arc 90 · First campaign
            </Typography>
            <Typography variant="h1" component="h1" id="hero-title" sx={{ mb: 3, color: colors.textOnDark, ...enter(120, 900) }}>
              Build habits.
              <Box
                component="span"
                sx={{
                  display: 'block',
                  color: colors.mint300,
                  background: gradients.accentText,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Keep growing.
              </Box>
            </Typography>
            <Typography variant="subtitle1" sx={{ color: 'rgba(255, 255, 255, 0.86)', maxWidth: 540, mb: 4, ...enter(280) }}>
              Arcloop helps you build habits and work toward goals you care about, with friends and groups to keep you
              going. Progress over perfection, and sharing only what you choose.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, ...enter(420) }}>
              <Button component={RouterLink} to={ROUTES.signup} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={onBrandButtons.solid}>
                Start Your Journey
              </Button>
              <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" size="large" sx={onBrandButtons.glass}>
                Explore Challenges
              </Button>
            </Box>
            <Typography variant="body2" sx={{ mt: 3, color: 'rgba(255, 255, 255, 0.72)', ...enter(560) }}>
              {isBackendConfigured ? 'Early build: expect rough edges while we add features.' : 'Early build: sign-up is not open yet.'}
            </Typography>
          </Box>
          <Box sx={enter(300, 1000)}>
            <ProductPreview />
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
