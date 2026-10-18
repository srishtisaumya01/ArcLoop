import { Box, Typography } from '@mui/material'
import { ArrowDown, ArrowRight, BellRing, CalendarClock, Database, Mail, MonitorSmartphone, Server, Trophy, Webhook, Workflow } from 'lucide-react'
import { N8N_WORKFLOWS } from '../../constants/communityDemo.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

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

// Right arrow in a row on md+, down arrow when the row stacks on small screens.
function Arrow({ onDark = false, vertical = false }) {
  const color = onDark ? colors.mint300 : colors.textMuted
  return (
    <Box aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', color, flexShrink: 0, py: { xs: 0.5, md: vertical ? 0.5 : 0 } }}>
      {vertical ? (
        <ArrowDown size={22} />
      ) : (
        <>
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <ArrowDown size={22} />
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <ArrowRight size={22} />
          </Box>
        </>
      )}
    </Box>
  )
}

function Column({ title, children, onDark }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography variant="overline" component="p" sx={{ color: onDark ? colors.mint300 : colors.blue600 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

const row = { display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 0.5, md: 1.5 } }

// Planned architecture: the app and API raise events, n8n runs the workflows, participants get messages and the
// leaderboard is written back through the API.
export default function N8nArchitecture() {
  return (
    <Box
      role="figure"
      aria-label="Planned architecture. The Arcloop web app on Vercel calls the Django API on Render, which stores data in Neon Postgres. The API sends events to n8n by webhook, and n8n also runs on a schedule. n8n workflows send email and in-app notifications and update the leaderboard through the API."
    >
      <Box aria-hidden="true">
        <Typography variant="overline" component="p" sx={{ color: colors.blue600, mb: 1.25 }}>
          Arcloop platform
        </Typography>
        <Box sx={row}>
          <Node icon={MonitorSmartphone} title="Web app" sub="React · Vercel" />
          <Arrow />
          <Node icon={Server} title="Arcloop API" sub="Django · Render" />
          <Arrow />
          <Node icon={Database} title="Database" sub="Postgres · Neon" />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 2, pl: { md: '16%' } }}>
          <Arrow vertical />
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            Events by webhook: <b>challenge joined</b>, <b>group created</b>, <b>check-in saved</b>
          </Typography>
        </Box>

        <Box sx={{ borderRadius: `${radii.lg}px`, background: gradients.brand, color: colors.textOnDark, p: { xs: 2.5, md: 3.5 }, boxShadow: shadows.lg }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2.5 }}>
            <Workflow size={22} aria-hidden="true" />
            <Typography sx={{ fontWeight: 800, fontSize: '1.125rem' }}>n8n automation</Typography>
            <Box sx={{ ml: 'auto', px: 1.25, py: 0.25, borderRadius: '999px', border: '1px dashed rgba(255, 255, 255, 0.5)', fontSize: '0.8125rem', fontWeight: 600 }}>
              Planned
            </Box>
          </Box>
          <Box sx={{ ...row, alignItems: { xs: 'stretch', md: 'stretch' } }}>
            <Column title="Triggers" onDark>
              <Node tone="dark" icon={Webhook} title="Webhook" sub="Events from the API" />
              <Node tone="dark" icon={CalendarClock} title="Schedule" sub="Daily mornings · Sundays" />
            </Column>
            <Box sx={{ alignSelf: 'center' }}>
              <Arrow onDark />
            </Box>
            <Column title="Workflows" onDark>
              {N8N_WORKFLOWS.map((w) => (
                <Box key={w.key} sx={{ px: 1.5, py: 1, borderRadius: '10px', bgcolor: 'rgba(255, 255, 255, 0.12)', fontWeight: 600, fontSize: '0.9375rem' }}>
                  {w.title}
                </Box>
              ))}
            </Column>
            <Box sx={{ alignSelf: 'center' }}>
              <Arrow onDark />
            </Box>
            <Column title="Delivers" onDark>
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
