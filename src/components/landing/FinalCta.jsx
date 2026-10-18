import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { Section } from '../ui/Section.jsx'
import { ROUTES } from '../../constants/navigation.js'
import { useI18n } from '../../hooks/useI18n.js'
import { colors, gradients, onBrandButtons, radii, shadows } from '../../theme/tokens.js'

export default function FinalCta() {
  const { t } = useI18n()
  return (
    <Section>
      <Box
        sx={{
          textAlign: 'center',
          borderRadius: `${radii.lg}px`,
          px: { xs: 3, md: 8 },
          py: { xs: 7, md: 10 },
          background: gradients.brand,
          color: colors.textOnDark,
          boxShadow: shadows.lg,
        }}
      >
        <Typography variant="h2" component="h2" sx={{ mb: 2 }}>
          {t('Your next arc starts with one small habit.')}
        </Typography>
        <Typography variant="subtitle1" sx={{ maxWidth: 560, mx: 'auto', mb: 4, color: 'rgba(255, 255, 255, 0.86)' }}>
          {t('Arcloop is in early development. Explore what is planned, and check back as we open the beta.')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button component={RouterLink} to={ROUTES.signup} variant="contained" size="large" sx={onBrandButtons.solid}>
            {t('Start Your Journey')}
          </Button>
          <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" size="large" sx={onBrandButtons.glass}>
            {t('Explore Challenges')}
          </Button>
        </Box>
      </Box>
    </Section>
  )
}
