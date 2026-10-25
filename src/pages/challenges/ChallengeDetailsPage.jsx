import { useCallback, useEffect } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { Box, Button, Chip, Container, Skeleton, Typography } from '@mui/material'
import { Check, FileQuestion, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import JoinPanel from '../../components/challenges/JoinPanel.jsx'
import ProgressPreview from '../../components/challenges/ProgressPreview.jsx'
import { VisibilityChip } from '../../components/challenges/ChallengeCard.jsx'
import DemoBadge from '../../components/ui/DemoBadge.jsx'
import { getChallenge } from '../../services/challengeService.js'
import { useAsync } from '../../hooks/useAsync.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths } from '../../theme/tokens.js'

const BACK = { to: ROUTES.challenges, label: 'All challenges' }

function List({ items }) {
  const { t } = useI18n()
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
      {items.map((item) => (
        <Box component="li" key={item} sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ color: colors.blue600, mt: '3px', flexShrink: 0 }}>
            <Check size={20} aria-hidden="true" />
          </Box>
          <Typography>{t(item)}</Typography>
        </Box>
      ))}
    </Box>
  )
}

function Block({ title, children }) {
  const { t } = useI18n()
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
        {t(title)}
      </Typography>
      {children}
    </Box>
  )
}

export default function ChallengeDetailsPage() {
  const { t } = useI18n()
  const { slug } = useParams()
  const load = useCallback(() => getChallenge(slug), [slug])
  const { status, data: challenge, retry } = useAsync(load)

  const title = status === 'success' ? (challenge ? t(challenge.title) : t('Challenge not found')) : t('Challenge')
  usePageMeta(title, challenge ? t(challenge.summary) : undefined)

  // The #join target only exists once the challenge has loaded.
  const { hash } = useLocation()
  useEffect(() => {
    if (status === 'success' && challenge && hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [status, challenge, hash])

  if (status === 'loading') {
    return (
      <Container aria-busy="true" sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <span role="status" style={{ position: 'absolute', left: -9999 }}>{t('Loading challenge…')}</span>
        <Skeleton width={160} height={24} />
        <Skeleton width="60%" height={64} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={320} sx={{ borderRadius: 4 }} />
      </Container>
    )
  }

  if (status === 'error') {
    return (
      <Container sx={{ maxWidth: `${contentWidths.narrow}px !important`, py: { xs: 6, md: 10 } }}>
        <StatePanel
          tone="error"
          headingLevel={1}
          icon={TriangleAlert}
          title={t('We couldn’t load this challenge')}
          text={t('Something went wrong while loading. Please try again.')}
          action={
            <Button variant="contained" color="primary" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>
              {t('Try again')}
            </Button>
          }
        />
      </Container>
    )
  }

  if (!challenge) {
    return (
      <Container sx={{ maxWidth: `${contentWidths.narrow}px !important`, py: { xs: 6, md: 10 } }}>
        <StatePanel
          headingLevel={1}
          icon={FileQuestion}
          title={t('Challenge not found')}
          text={t('This challenge doesn’t exist, or the link is out of date.')}
          action={
            <Button component={RouterLink} to={ROUTES.challenges} variant="contained" color="primary">
              {t('Browse challenges')}
            </Button>
          }
        />
      </Container>
    )
  }

  return (
    <>
      <PageHeader eyebrow={challenge.featured ? t('Featured campaign') : t(challenge.category)} title={t(challenge.title)} description={t(challenge.summary)} back={{ ...BACK, label: t(BACK.label) }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            alignItems: 'center',
            '& .MuiChip-root': { color: colors.textOnDark, bgcolor: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.5)' },
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        >
          <Chip label={t(challenge.category)} size="small" />
          <Chip label={t(challenge.durationLabel)} size="small" variant="outlined" />
          <VisibilityChip visibility={challenge.visibility} />
          <DemoBadge onDark label="Demo challenge" />
        </Box>
      </PageHeader>

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Box sx={{ display: 'grid', gap: { xs: 5, md: 7 }, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.6fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
          <Box>
            <Block title="About this challenge">
              <Typography color="text.secondary">{t(challenge.description)}</Typography>
              <Typography sx={{ mt: 2 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{t('Organizer:')} </Box>
                {t(challenge.organizer.name)} ({t(challenge.organizer.role)})
              </Typography>
            </Block>
            <Block title="Rules">
              <List items={challenge.rules} />
            </Block>
            <Block title="Habits and goals">
              <List items={challenge.habits} />
            </Block>
            <Block title="How progress is counted">
              <Typography color="text.secondary">{t(challenge.scoring)}</Typography>
            </Block>
            <ProgressPreview progress={challenge.sampleProgress} />
          </Box>
          <Box sx={{ position: { md: 'sticky' }, top: { md: 96 } }}>
            <JoinPanel key={challenge.slug} challenge={challenge} />
          </Box>
        </Box>
      </Container>
    </>
  )
}
