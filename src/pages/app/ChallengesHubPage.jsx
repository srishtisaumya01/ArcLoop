import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Container, InputAdornment, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
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
import { groupByCategory } from '../../utils/groupByCategory.js'
import { colors, contentWidths, radii } from '../../theme/tokens.js'

const ALL = '__all__'

// The signed-in Challenges page: make your own challenge, see the ones you are in, and search everything you can join.
export default function ChallengesHubPage() {
  const { t } = useI18n()
  usePageMeta(t('Challenges'))
  const mine = useMyChallenges()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [creating, setCreating] = useState(false)

  const all = useAsync(listAppChallenges)
  const categories = useMemo(() => [...new Set((all.data ?? []).map((c) => c.category))], [all.data])
  // Searching and the category filter work on the list already loaded, so they answer as you type.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (all.data ?? []).filter((c) => (category === ALL || c.category === category) && (!needle || `${t(c.title)} ${c.title} ${c.summary} ${c.category}`.toLowerCase().includes(needle)))
  }, [all.data, category, query, t])
  const groups = useMemo(() => groupByCategory(shown), [shown])
  useEffect(() => {
    window.addEventListener(CHALLENGES_CHANGED, all.retry)
    return () => window.removeEventListener(CHALLENGES_CHANGED, all.retry)
  }, [all.retry])

  return (
    <>
      <PageHeader eyebrow={t('Challenges')} title={t('Your challenges')} description={t('Join a challenge, do it with friends, or make one of your own.')} />
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
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
            <TextField type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search challenges')} sx={{ flex: '1 1 260px', maxWidth: 520, minWidth: 0 }}
              slotProps={{ htmlInput: { 'aria-label': t('Search challenges') }, input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }} />
            <TextField select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Category')} sx={{ flex: '0 1 220px', minWidth: 160 }}>
              <MenuItem value={ALL}>{t('All categories')}</MenuItem>
              {categories.map((c) => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
            </TextField>
            <Button variant="contained" size="large" startIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)} sx={{ whiteSpace: 'nowrap' }}>
              {t('Create a custom challenge')}
            </Button>
          </Box>
          {all.status === 'loading' && !all.data && <Skeleton variant="rounded" height={220} />}
          {all.status === 'error' && !all.data && (
            <StatePanel tone="error" icon={TriangleAlert} title={t('We couldn’t load the challenges')} text={t('Something went wrong while loading. Please try again.')}
              action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={all.retry}>{t('Try again')}</Button>} />
          )}
          {all.data && shown.length === 0 && <StatePanel icon={SearchX} title={t('No challenges match')} text={t('Try a different word, or create your own challenge.')} />}
          {all.data && shown.length > 0 && (
            <Box sx={{ display: 'grid', gap: 4 }}>
              {groups.map(({ category, items }, index) => (
                // The id is by position, not the category's name: names have spaces and '&', which aria-labelledby would split into several ids.
                <Box key={category} component="section" aria-labelledby={`challenge-category-${index}`}>
                  <Typography id={`challenge-category-${index}`} variant="h4" component="h3" sx={{ mb: 1.5 }}>
                    {t(category)} <Typography component="span" color="text.secondary">({items.length})</Typography>
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                    {items.map((c) => (
                      <Box key={c.slug} component={RouterLink} to={appChallengePath(c.slug)} sx={{ display: 'grid', gap: 1, alignContent: 'start', p: 2.5, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, color: 'inherit', textDecoration: 'none', '&:hover': { borderColor: colors.blue600 } }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={t(c.category)} />
                          <Chip size="small" variant="outlined" label={t('{count} days', { count: c.duration_days })} />
                          {c.enrollment && <Chip size="small" color="success" label={t('You are in')} />}
                        </Box>
                        <Typography variant="h5" component="h4">{t(c.title)}</Typography>
                        <Typography variant="body2" color="text.secondary">{t(c.summary)}</Typography>
                      </Box>
                    ))}
                  </Box>
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
