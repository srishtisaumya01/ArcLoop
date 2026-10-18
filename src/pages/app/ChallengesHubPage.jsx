import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Container, InputAdornment, Skeleton, TextField, Typography } from '@mui/material'
import { Plus, RefreshCw, Search, SearchX, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import CreateChallengeDialog from '../../components/myChallenges/CreateChallengeDialog.jsx'
import MyChallengeCard from '../../components/myChallenges/MyChallengeCard.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { useMyChallenges } from '../../hooks/useMyChallenges.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { CHALLENGES_CHANGED, listAppChallenges } from '../../services/myChallengesService.js'
import { appChallengePath } from '../../constants/navigation.js'
import { colors, contentWidths, onBrandButtons, radii } from '../../theme/tokens.js'

// The signed-in Challenges page: make your own challenge, see the ones you are in, and search everything you can join.
export default function ChallengesHubPage() {
  const { t } = useI18n()
  usePageMeta(t('Challenges'))
  const mine = useMyChallenges()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(id)
  }, [query])
  const load = useCallback(() => listAppChallenges(debounced), [debounced])
  const all = useAsync(load)
  useEffect(() => {
    window.addEventListener(CHALLENGES_CHANGED, all.retry)
    return () => window.removeEventListener(CHALLENGES_CHANGED, all.retry)
  }, [all.retry])

  return (
    <>
      <PageHeader eyebrow={t('Challenges')} title={t('Your challenges')} description={t('Join a challenge, do it with friends, or make one of your own.')}>
        <Button variant="contained" size="large" startIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)} sx={onBrandButtons.solid}>
          {t('Create a custom challenge')}
        </Button>
      </PageHeader>
      {creating && <CreateChallengeDialog open onClose={() => setCreating(false)} />}

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 5 }}>
        <Box component="section" aria-labelledby="ongoing-title">
          <Typography id="ongoing-title" variant="h3" component="h2" sx={{ mb: 2 }}>{t('Ongoing challenges')}</Typography>
          {mine.status === 'loading' && <Skeleton variant="rounded" height={200} />}
          {mine.status === 'error' && (
            <StatePanel tone="error" icon={TriangleAlert} title={t('We couldn’t load your challenges')} text={t('Something went wrong while loading. Please try again.')}
              action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={mine.retry}>{t('Try again')}</Button>} />
          )}
          {mine.status === 'success' && mine.ongoing.length === 0 && (
            <Typography color="text.secondary">{t('You are not in any challenge yet. Pick one below, or create your own.')}</Typography>
          )}
          {mine.status === 'success' && mine.ongoing.length > 0 && (
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {mine.ongoing.map((item) => <MyChallengeCard key={item.slug} item={item} />)}
            </Box>
          )}
        </Box>

        <Box component="section" aria-labelledby="all-title">
          <Typography id="all-title" variant="h3" component="h2" sx={{ mb: 2 }}>{t('All challenges')}</Typography>
          <TextField fullWidth type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search challenges')} aria-label={t('Search challenges')} sx={{ mb: 3, maxWidth: 560 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }} />
          {all.status === 'loading' && !all.data && <Skeleton variant="rounded" height={220} />}
          {all.status === 'error' && !all.data && (
            <StatePanel tone="error" icon={TriangleAlert} title={t('We couldn’t load the challenges')} text={t('Something went wrong while loading. Please try again.')}
              action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={all.retry}>{t('Try again')}</Button>} />
          )}
          {all.data && all.data.length === 0 && <StatePanel icon={SearchX} title={t('No challenges match')} text={t('Try a different word, or create your own challenge.')} />}
          {all.data && all.data.length > 0 && (
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
              {all.data.map((c) => (
                <Box key={c.slug} component={RouterLink} to={appChallengePath(c.slug)} sx={{ display: 'grid', gap: 1, alignContent: 'start', p: 2.5, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, color: 'inherit', textDecoration: 'none', '&:hover': { borderColor: colors.blue600 } }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label={t(c.category)} />
                    <Chip size="small" variant="outlined" label={t('{count} days', { count: c.duration_days })} />
                    {c.enrollment && <Chip size="small" color="success" label={t('You are in')} />}
                  </Box>
                  <Typography variant="h4" component="h3">{t(c.title)}</Typography>
                  <Typography variant="body2" color="text.secondary">{t(c.summary)}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {mine.finished.length > 0 && (
          <Box component="section" aria-labelledby="finished-title">
            <Typography id="finished-title" variant="h3" component="h2" sx={{ mb: 2 }}>{t('Finished challenges')}</Typography>
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {mine.finished.map((item) => <MyChallengeCard key={item.slug} item={item} />)}
            </Box>
          </Box>
        )}
      </Container>
    </>
  )
}
