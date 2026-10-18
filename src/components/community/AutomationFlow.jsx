import { Box, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { BellRing, CalendarClock, Database, Mail, MonitorSmartphone, Server, Trophy, Webhook, Workflow } from 'lucide-react'
import FlowConnector from './FlowConnector.jsx'
import { AUTOMATIONS } from '../../constants/communityDemo.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

// Each workflow lights up in turn, as if a message were passing through it.
const highlight = keyframes`
  0%, 16% { background-color: rgba(255, 255, 255, 0.3); transform: translateX(6px); box-shadow: 0 0 0 1px rgba(124, 240, 192, 0.85); }
  22%, 100% { background-color: rgba(255, 255, 255, 0.12); transform: none; box-shadow: 0 0 0 1px transparent; }
`
const breathe = keyframes`
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
`
const STEP_SECONDS = 1.6

function Node({ icon: Icon, title, sub, tone = 'light' }) {
  const dark = tone === 'dark'
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.75,
        borderRadius: `${radii.md}px`,
        bgcolor: dark ? 'rgba(255, 255, 255, 0.1)' : colors.surface,
        border: `1px solid ${dark ? 'rgba(255, 255, 255, 0.28)' : colors.border}`,
        boxShadow: dark ? 'none' : shadows.sm,
        color: dark ? colors.textOnDark : colors.textPrimary,
      }}
    >
      <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: dark ? 'rgba(255, 255, 255, 0.14)' : colors.bgAlt, color: dark ? colors.mint300 : colors.blue600 }}>
        <Icon size={20} aria-hidden="true" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
        {sub && (
          <Typography variant="body2" sx={{ color: dark ? 'rgba(255, 255, 255, 0.78)' : colors.textSecondary }}>
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function Column({ title, children }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography variant="overline" component="p" sx={{ color: colors.mint300 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

const row = { display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 0.5, md: 1.5 } }

// Planned flow: the app and API raise events, the automation engine runs the workflows, participants get messages and the
// leaderboard is written back through the API. Dots travel along the connectors and the workflows light up in turn.
export default function AutomationFlow() {
  const cycleSeconds = AUTOMATIONS.length * STEP_SECONDS
  return (
    <Box
      role="figure"
      aria-label="Planned architecture. The Arcloop web app on Vercel calls the Django API on Render, which stores data in Neon Postgres. The API sends events to the automation engine by webhook, which also runs on a schedule. Its workflows send email and in-app notifications and update the leaderboard through the API."
    >
      <Box aria-hidden="true">
        <Typography variant="overline" component="p" sx={{ color: colors.blue600, mb: 1.25 }}>
          Arcloop platform
        </Typography>
        <Box sx={row}>
          <Node icon={MonitorSmartphone} title="Web app" sub="React · Vercel" />
          <FlowConnector delay={0} />
          <Node icon={Server} title="Arcloop API" sub="Django · Render" />
          <FlowConnector delay={0.6} />
          <Node icon={Database} title="Database" sub="Postgres · Neon" />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 1.5, pl: { md: '16%' } }}>
          <FlowConnector vertical delay={0.9} />
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            Events by webhook: <b>challenge joined</b>, <b>group created</b>, <b>check-in saved</b>
          </Typography>
        </Box>

        <Box sx={{ borderRadius: `${radii.lg}px`, background: gradients.brand, color: colors.textOnDark, p: { xs: 2.5, md: 3.5 }, boxShadow: shadows.lg }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2.5 }}>
            <Workflow size={22} aria-hidden="true" />
            <Typography sx={{ fontWeight: 800, fontSize: '1.125rem' }}>Automation</Typography>
            <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.25, borderRadius: '999px', border: '1px dashed rgba(255, 255, 255, 0.5)', fontSize: '0.8125rem', fontWeight: 600 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors.mint300, animation: `${breathe} 1.6s ease-in-out infinite`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
              Planned
            </Box>
          </Box>
          <Box sx={{ ...row, alignItems: { xs: 'stretch', md: 'stretch' } }}>
            <Column title="Triggers">
              <Node tone="dark" icon={Webhook} title="Webhook" sub="Events from the API" />
              <Node tone="dark" icon={CalendarClock} title="Schedule" sub="Daily mornings · Sundays" />
            </Column>
            <Box sx={{ alignSelf: 'center', display: 'flex' }}>
              <FlowConnector onDark delay={0.2} />
            </Box>
            <Column title="Workflows">
              {AUTOMATIONS.map((w, i) => (
                <Box
                  key={w.key}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: '10px',
                    bgcolor: 'rgba(255, 255, 255, 0.12)',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    animation: `${highlight} ${cycleSeconds}s ease-in-out ${i * STEP_SECONDS}s infinite`,
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                >
                  {w.title}
                </Box>
              ))}
            </Column>
            <Box sx={{ alignSelf: 'center', display: 'flex' }}>
              <FlowConnector onDark delay={0.8} />
            </Box>
            <Column title="Delivers">
              <Node tone="dark" icon={Mail} title="Email" sub="Welcome, reminders, reports" />
              <Node tone="dark" icon={BellRing} title="In-app notice" sub="Shown when you open Arcloop" />
              <Node tone="dark" icon={Trophy} title="Leaderboard" sub="Written back through the API" />
            </Column>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
