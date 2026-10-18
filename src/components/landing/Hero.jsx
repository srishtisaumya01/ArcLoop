import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import ProductPreview from './ProductPreview.jsx'
import AnimatedText, { LightBeam } from '../ui/AnimatedText.jsx'
import { useI18n } from '../../hooks/useI18n.js'
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
  const { t, lang } = useI18n()
  const byWord = lang !== 'en' // scripts whose letters join are animated a word at a time
  const line1 = t('Build habits.')
  const line2 = t('Keep growing.')
  const unitsOf = (text) => (byWord ? text.split(' ').length : Array.from(text.replace(/ /g, '')).length)
  const totalUnits = unitsOf(line1) + unitsOf(line2)
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
            rowGap: { xs: 7, md: 8 },
            columnGap: { md: 14, lg: 18 },
            alignItems: 'center',
            gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' },
          }}
        >
          <Box>
            <Typography variant="overline" component="p" sx={{ color: colors.mint300, mb: 2, display: 'block', ...enter(0, 700) }}>
              {t('Winter Arc 90 · First campaign')}
            </Typography>
            <Typography variant="h1" component="h1" id="hero-title" aria-label={`${line1} ${line2}`} sx={{ position: 'relative', mb: 3, color: colors.textOnDark }}>
              <LightBeam totalUnits={totalUnits} byWord={byWord} delayMs={1600} />
              <Box component="span" sx={{ display: 'block', position: 'relative' }}>
                <AnimatedText text={line1} byWord={byWord} totalUnits={totalUnits} />
              </Box>
              <Box component="span" sx={{ display: 'block', position: 'relative' }}>
                <AnimatedText text={line2} byWord={byWord} from={colors.mint300} to={colors.ice300} startIndex={unitsOf(line1)} totalUnits={totalUnits} enterDelay={unitsOf(line1) * 45} />
              </Box>
            </Typography>
            <Typography variant="subtitle1" sx={{ color: 'rgba(255, 255, 255, 0.86)', maxWidth: 540, mb: 4, ...enter(280) }}>
              {t('Arcloop helps you build habits and work toward goals you care about, with friends and groups to keep you going. Progress over perfection, and sharing only what you choose.')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, ...enter(420) }}>
              <Button component={RouterLink} to={ROUTES.signup} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={onBrandButtons.solid}>
                {t('Start Your Journey')}
              </Button>
              <Button component={RouterLink} to={ROUTES.challenges} variant="outlined" size="large" sx={onBrandButtons.glass}>
                {t('Explore Challenges')}
              </Button>
            </Box>
            <Typography variant="body2" sx={{ mt: 3, color: 'rgba(255, 255, 255, 0.72)', ...enter(560) }}>
              {isBackendConfigured ? t('Early build: expect rough edges while we add features.') : t('Early build: sign-up is not open yet.')}
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
