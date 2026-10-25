import { useCallback, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, InputAdornment, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
import { ArrowRight, Check, RefreshCw, Search, SearchX, TriangleAlert, Workflow } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import ChallengeCard from '../../components/challenges/ChallengeCard.jsx'
import FeaturedChallengeCard from '../../components/challenges/FeaturedChallengeCard.jsx'
import ChartCard from '../../components/charts/ChartCard.jsx'
import LineChart from '../../components/charts/LineChart.jsx'
import StatTiles from '../../components/community/StatTiles.jsx'
import { SectionHeading } from '../../components/ui/Section.jsx'
import { listChallenges } from '../../services/challengeService.js'
import { useAsync } from '../../hooks/useAsync.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { CHALLENGE_CATEGORIES, VISIBILITY_OPTIONS } from '../../constants/demoChallenges.js'
import { COMMUNITY_GROWTH, COMMUNITY_STATS, AUTOMATIONS, WEEK_LABELS } from '../../constants/communityDemo.js'
import { ROUTES } from '../../constants/navigation.js'
import { ALL, filterChallenges, hasActiveFilters } from '../../utils/challengeFilters.js'
import { chart, colors, contentWidths, gradients, onBrandButtons, shadows } from '../../theme/tokens.js'

const INITIAL_FILTERS = { query: '', category: ALL, visibility: ALL }

function CardSkeletons() {
  return (
    <Box aria-hidden="true" sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: 4 }} />
      ))}
    </Box>
  )
}

export default function ExploreChallengesPage() {
  const { t } = useI18n()
  usePageMeta(t('Explore challenges'), t('Browse Arcloop challenges by category and visibility.'))
  const load = useCallback(() => listChallenges(), [])
  const { status, data, retry } = useAsync(load)
  const [filters, setFilters] = useState(INITIAL_FILTERS)

  const setFilter = (name) => (event) => setFilters((f) => ({ ...f, [name]: event.target.value }))
  const filtered = useMemo(() => (data ? filterChallenges(data, filters) : []), [data, filters])
  const active = hasActiveFilters(filters)
  const featured = data?.find((c) => c.featured)
  // The featured panel and the grid never show the same challenge twice.
  const gridItems = !active && featured ? filtered.filter((c) => c.slug !== featured.slug) : filtered

  return (
    <>
      <PageHeader
        tone="brand"
        eyebrow={t('Challenges')}
        title={t('Explore challenges')}
        description={t('Find a challenge to build a habit alongside others, or use one as inspiration for your own.')}
      />

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        {status === 'success' && featured && !active && (
          <Box sx={{ mb: { xs: 5, md: 7 } }}>
            <FeaturedChallengeCard challenge={featured} headingLevel="h2" />
          </Box>
        )}

        <Box component="section" aria-labelledby="community-growth-title" sx={{ mb: { xs: 6, md: 9 } }}>
          <SectionHeading
            eyebrow={t('Community growth')}
            titleId="community-growth-title"
            title={t('More people show up every week')}
            description={t('Active participants across all challenges, and the automation that supports you once you join.')}
          />
          <Box sx={{ mb: 3 }}>
            <StatTiles stats={COMMUNITY_STATS} />
          </Box>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
            <ChartCard title="Active participants per week" subtitle="Grew from 120 to 1,010 over 12 weeks">
              <LineChart
                ariaLabel={t('Line chart of active participants per week over 12 weeks, rising steadily from 120 in week 1 to 1,010 in week 12.')}
                labels={WEEK_LABELS}
                series={[{ key: 'active', label: t('Active participants'), color: chart.series1, values: COMMUNITY_GROWTH }]}
                format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(v))}
                area
              />
            </ChartCard>
            <Box sx={{ p: { xs: 3, md: 3.5 }, borderRadius: '24px', background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.lg }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Workflow size={20} aria-hidden="true" />
                <Typography variant="overline" component="p" sx={{ color: colors.mint300 }}>
                  {t('When you join')}
                </Typography>
              </Box>
              <Typography variant="h3" component="h3" sx={{ mb: 2.5 }}>
                {t('Automation that keeps you going')}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.75, mb: 3 }}>
                {AUTOMATIONS.map((w) => (
                  <Box component="li" key={w.key} sx={{ display: 'flex', gap: 1.25 }}>
                    <Box sx={{ color: colors.mint300, mt: '3px', flexShrink: 0 }}>
                      <Check size={18} aria-hidden="true" />
                    </Box>
                    <Typography sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                      <b>{t(w.title)}:</b> {t(w.action)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button component={RouterLink} to={ROUTES.howItWorks} variant="contained" sx={onBrandButtons.solid} endIcon={<ArrowRight size={18} />}>
                  {t('How it works')}
                </Button>
                <Button component={RouterLink} to={ROUTES.participants} variant="outlined" sx={onBrandButtons.glass}>
                  {t('Top participants')}
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>

        <Typography variant="h3" component="h2" sx={{ mb: 3 }}>
          {t('Browse all challenges')}
        </Typography>

        <Box component="form" role="search" aria-label={t('Filter challenges')} onSubmit={(e) => e.preventDefault()} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, mb: 3 }}>
          <TextField
            id="challenge-search"
            type="search"
            label={t('Search challenges')}
            value={filters.query}
            onChange={setFilter('query')}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }}
          />
          <TextField select id="challenge-category" label={t('Category')} value={filters.category} onChange={setFilter('category')}>
            <MenuItem value={ALL}>{t('All categories')}</MenuItem>
            {CHALLENGE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{t(c)}</MenuItem>
            ))}
          </TextField>
          <TextField select id="challenge-visibility" label={t('Visibility')} value={filters.visibility} onChange={setFilter('visibility')}>
            <MenuItem value={ALL}>{t('Any visibility')}</MenuItem>
            {VISIBILITY_OPTIONS.map((v) => (
              <MenuItem key={v.value} value={v.value}>{t(v.label)}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, mb: 3 }}>
          <Typography role="status" color="text.secondary" aria-live="polite">
            {status === 'loading' && t('Loading challenges…')}
            {status === 'success' && t('Showing {shown} of {total} challenges', { shown: filtered.length, total: data.length })}
          </Typography>
          {active && (
            <Button size="small" onClick={() => setFilters(INITIAL_FILTERS)}>
              {t('Clear filters')}
            </Button>
          )}
        </Box>

        {status === 'loading' && <CardSkeletons />}

        {status === 'error' && (
          <StatePanel
            tone="error"
            icon={TriangleAlert}
            title={t('We couldn’t load challenges')}
            text={t('Something went wrong while loading. Please try again.')}
            action={
              <Button variant="contained" color="primary" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>
                {t('Try again')}
              </Button>
            }
          />
        )}

        {status === 'success' && filtered.length === 0 && (
          <StatePanel
            icon={SearchX}
            title={t('No challenges match your search')}
            text={t('Try a different word, or clear the filters to see everything.')}
            action={<Button variant="outlined" color="primary" onClick={() => setFilters(INITIAL_FILTERS)}>{t('Clear filters')}</Button>}
          />
        )}

        {status === 'success' && gridItems.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            {gridItems.map((c, i) => (
              <li key={c.slug}>
                <ChallengeCard challenge={c} delay={(i % 3) * 110} />
              </li>
            ))}
          </Box>
        )}
      </Container>
    </>
  )
}
