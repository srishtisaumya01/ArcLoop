import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import ProductPreview from './ProductPreview.jsx'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

export default function Hero() {
  return (
    <Box
      component="section"
      aria-labelledby="hero-title"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        pt: { xs: 6, md: 10 },
        pb: { xs: 8, md: 12 },
        background: gradients.hero,
      }}
    >
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 6, md: 8 },
            alignItems: 'center',
            gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          }}
        >
          <Box>
            <Typography variant="overline" component="p" sx={{ color: colors.blue600, mb: 2, display: 'block' }}>
              Winter Arc 90 · First campaign
            </Typography>
            <Typography variant="h1" component="h1" id="hero-title" sx={{ mb: 3 }}>
              Build habits.
              <Box component="span" sx={{ display: 'block', color: colors.blue600 }}>
                Keep growing.
              </Box>
            </Typography>
            <Typography variant="subtitle1" sx={{ color: 'text.secondary', maxWidth: 540, mb: 4 }}>
              Arcloop helps you build habits and work toward goals you care about, with friends and groups to keep you
              going. Progress over perfection, and sharing only what you choose.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Button component={RouterLink} to={ROUTES.signup} variant="contained" color="primary" size="large" endIcon={<ArrowRight size={18} />}>
                Start Your Journey
              </Button>
              <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" color="primary" size="large">
                Explore Challenges
              </Button>
            </Box>
            <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
              {isBackendConfigured ? 'Early build: expect rough edges while we add features.' : 'Early build: sign-up is not open yet.'}
            </Typography>
          </Box>
          <ProductPreview />
        </Box>
      </Container>
    </Box>
  )
}
