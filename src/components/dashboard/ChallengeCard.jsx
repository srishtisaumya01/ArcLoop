import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { Plus, Trophy } from 'lucide-react'
import MyChallengeCard from '../myChallenges/MyChallengeCard.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, radii } from '../../theme/tokens.js'

// The challenges the person has joined or made, on their dashboard. With none, an invitation to find one.
export default function ChallengeCard({ status, ongoing }) {
  const { t } = useI18n()
  if (status === 'loading') return <Skeleton variant="rounded" height={200} />
  if (status === 'error') return null
  return (
    <Reveal delay={60}>
      <Box id="ongoing-challenges" sx={{ display: 'grid', gap: 2, scrollMarginTop: '16px' }}>
        {ongoing.length === 0 ? (
          <Box sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px dashed ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
            <Typography variant="h4" component="h2" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Trophy size={20} aria-hidden="true" />{t('No ongoing challenge')}</Typography>
            <Typography color="text.secondary">{t('Join a challenge, do it with friends, or create your own. It will show up here.')}</Typography>
            <Button component={RouterLink} to={ROUTES.appChallenges} variant="contained" size="small" startIcon={<Plus size={16} aria-hidden="true" />}>{t('Browse challenges')}</Button>
          </Box>
        ) : (
          <>
            {ongoing.slice(0, 3).map((item) => <MyChallengeCard key={item.slug} item={item} />)}
            {ongoing.length > 3 && <Button component={RouterLink} to={ROUTES.appChallenges} size="small">{t('See all {count} challenges', { count: ongoing.length })}</Button>}
          </>
        )}
      </Box>
    </Reveal>
  )
}
