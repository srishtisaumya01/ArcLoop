import { useCallback, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, InputAdornment, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
import { ArrowRight, Check, Info, RefreshCw, Search, SearchX, TriangleAlert, Workflow } from 'lucide-react'
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
  usePageMeta('Explore challenges', 'Browse sample Arcloop challenges by category and visibility.')
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
        eyebrow="Challenges"
        title="Explore challenges"
        description="Find a challenge to build a habit alongside others, or use one as inspiration for your own."
      >
        <Box role="note" sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', maxWidth: 680, p: 2, borderRadius: '12px', bgcolor: 'rgba(255, 255, 255, 0.1)', border: '1px dashed rgba(255, 255, 255, 0.45)' }}>
          <Info size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            Demo content: these are sample challenges for previewing the layout. They are not real campaigns, and no one has joined them.
          </Typography>
        </Box>
      </PageHeader>

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        {status === 'success' && featured && !active && (
          <Box sx={{ mb: { xs: 5, md: 7 } }}>
            <FeaturedChallengeCard challenge={featured} />
          </Box>
        )}

        <Box component="section" aria-labelledby="community-growth-title" sx={{ mb: { xs: 6, md: 9 } }}>
          <SectionHeading
            eyebrow="Community growth"
            titleId="community-growth-title"
            title="More people show up every week"
            description="Active participants across all challenges, and the automation that supports you once you join."
          />
          <Box sx={{ mb: 3 }}>
            <StatTiles stats={COMMUNITY_STATS} />
          </Box>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
            <ChartCard title="Active participants per week" subtitle="Grew from 120 to 1,010 over 12 weeks">
              <LineChart
                ariaLabel="Line chart of active participants per week over 12 weeks, rising steadily from 120 in week 1 to 1,010 in week 12."
                labels={WEEK_LABELS}
                series={[{ key: 'active', label: 'Active participants', color: chart.series1, values: COMMUNITY_GROWTH }]}
                format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(v))}
                area
              />
            </ChartCard>
            <Box sx={{ p: { xs: 3, md: 3.5 }, borderRadius: '24px', background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.lg }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Workflow size={20} aria-hidden="true" />
                <Typography variant="overline" component="p" sx={{ color: colors.mint300 }}>
                  When you join
                </Typography>
              </Box>
              <Typography variant="h3" component="h3" sx={{ mb: 2.5 }}>
                Automation that keeps you going
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.75, mb: 3 }}>
                {AUTOMATIONS.map((w) => (
                  <Box component="li" key={w.key} sx={{ display: 'flex', gap: 1.25 }}>
                    <Box sx={{ color: colors.mint300, mt: '3px', flexShrink: 0 }}>
                      <Check size={18} aria-hidden="true" />
                    </Box>
                    <Typography sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                      <b>{w.title}:</b> {w.action}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button component={RouterLink} to={ROUTES.howItWorks} variant="contained" sx={onBrandButtons.solid} endIcon={<ArrowRight size={18} />}>
                  How it works
                </Button>
                <Button component={RouterLink} to={ROUTES.participants} variant="outlined" sx={onBrandButtons.glass}>
                  Top participants
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>

        <Typography variant="h3" component="h2" sx={{ mb: 3 }}>
          Browse all challenges
        </Typography>

        <Box component="form" role="search" aria-label="Filter challenges" onSubmit={(e) => e.preventDefault()} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, mb: 3 }}>
          <TextField
            id="challenge-search"
            type="search"
            label="Search challenges"
            value={filters.query}
            onChange={setFilter('query')}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden="true" /></InputAdornment> } }}
          />
          <TextField select id="challenge-category" label="Category" value={filters.category} onChange={setFilter('category')}>
            <MenuItem value={ALL}>All categories</MenuItem>
            {CHALLENGE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </TextField>
          <TextField select id="challenge-visibility" label="Visibility" value={filters.visibility} onChange={setFilter('visibility')}>
            <MenuItem value={ALL}>Any visibility</MenuItem>
            {VISIBILITY_OPTIONS.map((v) => (
              <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, mb: 3 }}>
          <Typography role="status" color="text.secondary" aria-live="polite">
            {status === 'loading' && 'Loading challenges…'}
            {status === 'success' && `Showing ${filtered.length} of ${data.length} sample challenges`}
          </Typography>
          {active && (
            <Button size="small" onClick={() => setFilters(INITIAL_FILTERS)}>
              Clear filters
            </Button>
          )}
        </Box>

        {status === 'loading' && <CardSkeletons />}

        {status === 'error' && (
          <StatePanel
            tone="error"
            icon={TriangleAlert}
            title="We couldn’t load challenges"
            text="Something went wrong while loading. Please try again."
            action={
              <Button variant="contained" color="primary" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>
                Try again
              </Button>
            }
          />
        )}

        {status === 'success' && filtered.length === 0 && (
          <StatePanel
            icon={SearchX}
            title="No challenges match your search"
            text="Try a different word, or clear the filters to see everything."
            action={<Button variant="outlined" color="primary" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</Button>}
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
