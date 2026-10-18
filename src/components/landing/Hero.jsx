import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import ProductPreview from './ProductPreview.jsx'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, gradients, navOuterHeight, onBrandButtons } from '../../theme/tokens.js'

// Two large open rings echoing the logo's loop, sitting low behind the content.
function Arcs() {
  const ring = {
    position: 'absolute',
    bottom: { xs: -260, md: -330 },
    width: { xs: 360, md: 460 },
    height: { xs: 360, md: 460 },
    borderRadius: '50%',
    border: { xs: '48px solid', md: '64px solid' },
    borderColor: 'rgba(255, 255, 255, 0.12) !important',
    pointerEvents: 'none',
  }
  return (
    <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' } }}>
      <Box sx={{ ...ring, left: { sm: '8%', md: '18%' } }} />
      <Box sx={{ ...ring, left: { sm: '42%', md: '42%' }, borderColor: `${colors.mint300}26 !important` }} />
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
        pb: { xs: 10, md: 16 },
        background: gradients.brand,
        color: colors.textOnDark,
      }}
    >
      <Arcs />
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
            <Typography variant="overline" component="p" sx={{ color: colors.mint300, mb: 2, display: 'block' }}>
              Winter Arc 90 · First campaign
            </Typography>
            <Typography variant="h1" component="h1" id="hero-title" sx={{ mb: 3, color: colors.textOnDark }}>
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
            <Typography variant="subtitle1" sx={{ color: 'rgba(255, 255, 255, 0.86)', maxWidth: 540, mb: 4 }}>
              Arcloop helps you build habits and work toward goals you care about, with friends and groups to keep you
              going. Progress over perfection, and sharing only what you choose.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Button component={RouterLink} to={ROUTES.signup} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={onBrandButtons.solid}>
                Start Your Journey
              </Button>
              <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" size="large" sx={onBrandButtons.glass}>
                Explore Challenges
              </Button>
            </Box>
            <Typography variant="body2" sx={{ mt: 3, color: 'rgba(255, 255, 255, 0.72)' }}>
              {isBackendConfigured ? 'Early build: expect rough edges while we add features.' : 'Early build: sign-up is not open yet.'}
            </Typography>
          </Box>
          <ProductPreview />
        </Box>
      </Container>
    </Box>
  )
}
