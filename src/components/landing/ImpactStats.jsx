import { Box, Container } from '@mui/material'
import StatTiles from '../community/StatTiles.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { COMMUNITY_STATS } from '../../constants/communityDemo.js'
import { contentWidths } from '../../theme/tokens.js'

// Headline community numbers that overlap the bottom of the hero, counting up as they scroll into view.
export default function ImpactStats() {
  const { t } = useI18n()
  return (
    <Box component="section" aria-label={t('Community highlights, sample data')} sx={{ position: 'relative', zIndex: 2, mt: { xs: -7, md: -12 }, pb: { xs: 2, md: 4 } }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <StatTiles stats={COMMUNITY_STATS} elevated />
      </Container>
    </Box>
  )
}
