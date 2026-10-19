import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, InputAdornment, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
import { Plus, Search, SearchX, Trophy } from 'lucide-react'
import CreateChallengeDialog from '../myChallenges/CreateChallengeDialog.jsx'
import MyChallengeCard from '../myChallenges/MyChallengeCard.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { CHALLENGES_CHANGED, listAppChallenges } from '../../services/myChallengesService.js'
import { ROUTES, appChallengePath } from '../../constants/navigation.js'
import { colors, radii } from '../../theme/tokens.js'

const ALL = '__all__'

// The dashboard's challenges section: a search box (it filters as you type), a category filter and a button to create your own
// challenge. With no search or filter it shows the challenges you are in; with one, the matching challenges you can join.
export default function ChallengeCard({ status, ongoing }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [creating, setCreating] = useState(false)
  const catalogue = useAsync(listAppChallenges)
  useEffect(() => {
    window.addEventListener(CHALLENGES_CHANGED, catalogue.retry)
    return () => window.removeEventListener(CHALLENGES_CHANGED, catalogue.retry)
  }, [catalogue.retry])

  const categories = useMemo(() => [...new Set((catalogue.data ?? []).map((c) => c.category))], [catalogue.data])
  const needle = query.trim().toLowerCase()
  const filtering = needle !== '' || category !== ALL
  const results = useMemo(
    () => (catalogue.data ?? []).filter((c) => (category === ALL || c.category === category) && (!needle || `${t(c.title)} ${c.title} ${c.summary} ${c.category}`.toLowerCase().includes(needle))),
    [catalogue.data, category, needle, t],
  )

  if (status === 'loading') return <Skeleton variant="rounded" height={200} />
  if (status === 'error') return null
  return (
    <Reveal delay={60}>
      <Box id="ongoing-challenges" sx={{ display: 'grid', gap: 2, scrollMarginTop: '16px' }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search challenges')} aria-label={t('Search challenges')} sx={{ flex: '1 1 220px', minWidth: 0 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }} />
          <TextField select size="small" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Category')} sx={{ flex: '0 1 200px', minWidth: 150 }}>
            <MenuItem value={ALL}>{t('All categories')}</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
          </TextField>
          <Button variant="contained" size="medium" startIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)} sx={{ whiteSpace: 'nowrap' }}>
            {t('Create a custom challenge')}
          </Button>
        </Box>
        {creating && <CreateChallengeDialog open onClose={() => setCreating(false)} />}

        {filtering ? (
          results.length === 0 ? (
            <Box sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px dashed ${colors.border}`, display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <SearchX size={22} aria-hidden="true" />
              <Typography color="text.secondary">{t('No challenges match')}</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {results.map((c) => (
                <Box key={c.slug} component={RouterLink} to={appChallengePath(c.slug)} sx={{ display: 'grid', gap: 0.75, alignContent: 'start', p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, color: 'inherit', textDecoration: 'none', '&:hover': { borderColor: colors.blue600 } }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label={t(c.category)} />
                    <Chip size="small" variant="outlined" label={t('{count} days', { count: c.duration_days })} />
                    {c.enrollment && <Chip size="small" color="success" label={t('You are in')} />}
                  </Box>
                  <Typography sx={{ fontWeight: 700 }}>{t(c.title)}</Typography>
                  <Typography variant="body2" color="text.secondary">{t(c.summary)}</Typography>
                </Box>
              ))}
            </Box>
          )
        ) : ongoing.length === 0 ? (
          <Box sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px dashed ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
            <Typography variant="h4" component="h2" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Trophy size={20} aria-hidden="true" />{t('No ongoing challenge')}</Typography>
            <Typography color="text.secondary">{t('Join a challenge, do it with friends, or create your own. It will show up here.')}</Typography>
            <Button component={RouterLink} to={ROUTES.appChallenges} variant="outlined" size="small">{t('Browse challenges')}</Button>
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
