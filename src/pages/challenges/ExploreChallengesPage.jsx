import { useCallback, useMemo, useState } from 'react'
import { Alert, Box, Button, Container, InputAdornment, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
import { RefreshCw, Search, SearchX, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import ChallengeCard from '../../components/challenges/ChallengeCard.jsx'
import FeaturedChallengeCard from '../../components/challenges/FeaturedChallengeCard.jsx'
import { listChallenges } from '../../services/challengeService.js'
import { useAsync } from '../../hooks/useAsync.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { CHALLENGE_CATEGORIES, VISIBILITY_OPTIONS } from '../../constants/demoChallenges.js'
import { ALL, filterChallenges, hasActiveFilters } from '../../utils/challengeFilters.js'
import { contentWidths } from '../../theme/tokens.js'

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
        eyebrow="Challenges"
        title="Explore challenges"
        description="Find a challenge to build a habit alongside others, or use one as inspiration for your own."
      >
        <Alert severity="info" variant="outlined" sx={{ maxWidth: 680 }}>
          Demo content: these are sample challenges for previewing the layout. They are not real campaigns, and no one has joined them.
        </Alert>
      </PageHeader>

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        {status === 'success' && featured && !active && (
          <Box sx={{ mb: { xs: 5, md: 7 } }}>
            <FeaturedChallengeCard challenge={featured} />
          </Box>
        )}

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
            {gridItems.map((c) => (
              <li key={c.slug}>
                <ChallengeCard challenge={c} />
              </li>
            ))}
          </Box>
        )}
      </Container>
    </>
  )
}
