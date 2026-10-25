import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { AlarmClock, ArrowRight, Flame, HeartHandshake, Quote, ChartColumn } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import DemoBadge from '../../components/ui/DemoBadge.jsx'
import { Section, SectionHeading } from '../../components/ui/Section.jsx'
import ChartCard from '../../components/charts/ChartCard.jsx'
import LineChart from '../../components/charts/LineChart.jsx'
import FinalCta from '../../components/landing/FinalCta.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { AUTOMATION_IMPACT, AUTOMATION_WEEKS, TOP_FEEDBACK, TOP_PARTICIPANTS } from '../../constants/communityDemo.js'
import { ROUTES } from '../../constants/navigation.js'
import { chart, colors, gradients, radii, shadows } from '../../theme/tokens.js'

const initials = (name) => name.split(' ').map((p) => p[0]).join('').slice(0, 2)

function Avatar({ name, size = 48 }) {
  return (
    <Box aria-hidden="true" sx={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, fontWeight: 800, fontSize: size > 44 ? '1.0625rem' : '0.875rem' }}>
      {initials(name)}
    </Box>
  )
}

function ConsistencyBar({ value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 140 }}>
      <Box aria-hidden="true" sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: chart.grid, overflow: 'hidden' }}>
        <Box sx={{ width: `${value}%`, height: '100%', borderRadius: 4, bgcolor: chart.series1 }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 36 }}>
        {value}%
      </Typography>
    </Box>
  )
}

function PodiumCard({ p, rank }) {
  const { t } = useI18n()
  const first = rank === 1
  return (
    <Card component="article" aria-label={t('Rank {rank}: {name}', { rank, name: p.name })} sx={{ height: '100%', position: 'relative', overflow: 'visible', ...(first && { border: '2px solid transparent', background: `linear-gradient(${colors.surface}, ${colors.surface}) padding-box, ${gradients.brand} border-box`, boxShadow: shadows.lg }) }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ px: 1.5, py: 0.5, borderRadius: '999px', fontWeight: 800, fontSize: '0.875rem', ...(first ? { background: gradients.brand, color: colors.textOnDark } : { bgcolor: colors.bgAlt, color: colors.textPrimary }) }}>
            {t('#{rank} this week', { rank })}
          </Box>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: colors.textSecondary }}>
            <Flame size={16} aria-hidden="true" />
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
              {t('{count}-day streak', { count: p.streak })}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar name={p.name} size={52} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h2">
              {p.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              @{p.username}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 0.5 }}>
          Challenge
        </Typography>
        <Typography sx={{ fontWeight: 700, mb: 0.25 }}>{t(p.challenge)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t(p.mode)}
        </Typography>
        <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 0.75 }}>
          Consistency this week
        </Typography>
        <ConsistencyBar value={p.consistency} />
      </CardContent>
    </Card>
  )
}

function RankTable({ rows, startRank }) {
  const { t } = useI18n()
  return (
    <Box sx={{ overflowX: 'auto', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radii.lg}px`, boxShadow: shadows.sm }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          minWidth: 720,
          borderCollapse: 'collapse',
          '& th, & td': { textAlign: 'left', px: 2.5, py: 1.75, borderBottom: `1px solid ${colors.border}`, verticalAlign: 'middle' },
          '& thead th': { fontSize: '0.8125rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: colors.textSecondary, bgcolor: colors.bgAlt },
          '& tbody tr:last-of-type td, & tbody tr:last-of-type th': { borderBottom: 'none' },
          '& tbody tr:hover': { bgcolor: colors.bg },
        }}
      >
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('Participants ranked {from} to {to} this week', { from: startRank, to: startRank + rows.length - 1 })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('Rank')}</th>
            <th scope="col">{t('Participant')}</th>
            <th scope="col">{t('Challenge')}</th>
            <th scope="col">{t('Joined as')}</th>
            <th scope="col">{t('Consistency')}</th>
            <th scope="col">{t('Streak')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.username}>
              <td>
                <Typography sx={{ fontWeight: 800 }}>#{startRank + i}</Typography>
              </td>
              <th scope="row" style={{ fontWeight: 'inherit' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Avatar name={p.name} size={36} />
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{p.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      @{p.username}
                    </Typography>
                  </Box>
                </Box>
              </th>
              <td>{t(p.challenge)}</td>
              <td>
                <Typography variant="body2" color="text.secondary">
                  {t(p.mode)}
                </Typography>
              </td>
              <td>
                <ConsistencyBar value={p.consistency} />
              </td>
              <td>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {t('{count} days', { count: p.streak })}
                </Typography>
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  )
}

const HELPS = [
  { icon: AlarmClock, title: 'A reminder at the right time', text: 'Each morning, in your own time zone, for the habits scheduled that day.' },
  { icon: HeartHandshake, title: 'A kind nudge after a missed day', text: 'A short, friendly message, so one missed day does not turn into a missed week.' },
  { icon: ChartColumn, title: 'A weekly report every Sunday', text: 'Your consistency for the week, and where your group stands, in one email.' },
]

export default function ParticipantsPage() {
  const { t } = useI18n()
  usePageMeta(t('Top participants'), t('This week’s most consistent Arcloop participants, how automated reminders help them, and what they say.'))
  const podium = TOP_PARTICIPANTS.slice(0, 3)
  const rest = TOP_PARTICIPANTS.slice(3)

  return (
    <>
      <PageHeader
        tone="brand"
        eyebrow={t('Participants')}
        title={t('Top participants this week')}
        description={t('Celebrating consistency, not perfection: ranked by the share of their scheduled days each person kept this week.')}
      />

      <Section>
        <Box component="ol" aria-label={t('Top three participants')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 4 }}>
          {podium.map((p, i) => (
            <li key={p.username}>
              <PodiumCard p={p} rank={i + 1} />
            </li>
          ))}
        </Box>
        <RankTable rows={rest} startRank={4} />
      </Section>

      <Section tone="alt" id="growth">
        <SectionHeading
          eyebrow={t('Growth')}
          title={t('Automation keeps people coming back')}
          description={t('Participants who receive the reminders and nudges keep more of their scheduled days, week after week.')}
        />
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
          <ChartCard title="Weekly consistency" subtitle="Average share of scheduled check-ins kept, by week since joining">
            <LineChart
              ariaLabel={t('Line chart of weekly consistency over 8 weeks. With reminders and nudges it rises from 62% to 79%. Without them it falls from 58% to 49%.')}
              labels={AUTOMATION_WEEKS}
              yMin={40}
              yMax={90}
              yStep={10}
              format={(v) => `${v}%`}
              series={[
                { key: 'with', label: t('With nudges'), color: chart.series1, values: AUTOMATION_IMPACT.withNudges },
                { key: 'without', label: t('Without nudges'), color: chart.series2, values: AUTOMATION_IMPACT.withoutNudges },
              ]}
            />
          </ChartCard>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
            {HELPS.map(({ icon: Icon, title, text }) => (
              <Box component="li" key={title} sx={{ display: 'flex', gap: 2, p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radii.md}px`, boxShadow: shadows.sm }}>
                <Box sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: '12px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark }}>
                  <Icon size={22} aria-hidden="true" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t(title)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(text)}
                  </Typography>
                </Box>
              </Box>
            ))}
            <Button component={RouterLink} to={ROUTES.howItWorks} variant="outlined" color="primary" endIcon={<ArrowRight size={18} />} sx={{ justifySelf: 'start' }}>
              {t('See how the automation works')}
            </Button>
          </Box>
        </Box>
      </Section>

      <Section id="feedback">
        <SectionHeading eyebrow={t('In their words')} title={t('What this week’s top performers say')} />
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {TOP_FEEDBACK.map((f) => (
            <li key={f.username}>
              <Card component="figure" sx={{ m: 0, height: '100%' }}>
                <CardContent sx={{ p: 3.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Box sx={{ color: colors.mint400, mb: 1.5 }}>
                    <Quote size={28} aria-hidden="true" />
                  </Box>
                  <Typography component="blockquote" sx={{ m: 0, mb: 3, fontSize: '1.0625rem', lineHeight: 1.65 }}>
                    {t(f.quote)}
                  </Typography>
                  <Box component="figcaption" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 'auto' }}>
                    <Avatar name={f.name} size={40} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{f.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        @{f.username} · {t(f.challenge)}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </li>
          ))}
        </Box>
        <Box sx={{ mt: 2 }}>
          <DemoBadge label="Sample feedback" />
        </Box>
      </Section>

      <FinalCta />
    </>
  )
}
