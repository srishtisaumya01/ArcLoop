import { Box, Typography } from '@mui/material'
import { Check, Lock } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import DemoBadge from '../ui/DemoBadge.jsx'
import { GROUP_POINTS } from '../../constants/landingContent.js'
import { colors, radii } from '../../theme/tokens.js'

const SAMPLE_MEMBERS = [
  { name: 'Member A', shared: '5 check-ins this week' },
  { name: 'Member B', shared: '3 check-ins this week' },
  { name: 'Member C', shared: 'Progress hidden', hidden: true },
]

export default function GroupsSection() {
  return (
    <Section tone="dark" id="groups">
      <Box sx={{ display: 'grid', gap: { xs: 6, md: 8 }, alignItems: 'center', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box>
          <SectionHeading
            onDark
            eyebrow="Friends and groups"
            title="Accountability that respects your privacy"
            description="Habits stick better with people around you. Arcloop is designed so you can be encouraged without being exposed."
          />
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, mt: -2 }}>
            {GROUP_POINTS.map((p) => (
              <Box component="li" key={p} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Box sx={{ mt: '3px', color: colors.mint300, flexShrink: 0 }}>
                  <Check size={20} aria-hidden="true" />
                </Box>
                <Typography sx={{ color: colors.textOnDarkMuted }}>{p}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box
          role="img"
          aria-label="Illustrative preview of a group's shared progress using sample data, where one member has chosen to hide their progress"
          sx={{ bgcolor: colors.navy800, border: '1px solid rgba(255,255,255,0.12)', borderRadius: `${radii.lg}px`, p: { xs: 2.5, md: 3.5 } }}
        >
          <Box aria-hidden="true">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h4" component="p">
                Sample group
              </Typography>
              <DemoBadge onDark />
            </Box>
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              {SAMPLE_MEMBERS.map((m) => (
                <Box key={m.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, borderRadius: `${radii.md}px`, bgcolor: 'rgba(255,255,255,0.06)' }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: colors.mint300, color: colors.navy900, fontWeight: 800 }}>
                    {m.name.slice(-1)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{m.name}</Typography>
                    <Typography variant="body2" sx={{ color: colors.textOnDarkMuted, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {m.hidden && <Lock size={14} />}
                      {m.shared}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            <Typography variant="body2" sx={{ mt: 2.5, color: colors.textOnDarkMuted }}>
              Habit names are never shown to the group unless you choose to share them.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Section>
  )
}
