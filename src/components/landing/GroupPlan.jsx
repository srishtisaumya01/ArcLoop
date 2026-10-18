import { Box, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { Flag, Rocket, UserPlus, UsersRound, MailCheck } from 'lucide-react'
import DemoBadge from '../ui/DemoBadge.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { useInView } from '../../hooks/useInView.js'
import { noMotion, popIn } from '../../theme/animations.js'
import { colors, radii } from '../../theme/tokens.js'

const SAMPLE_MEMBERS = [
  { name: 'Aarav', username: 'aarav.moves' },
  { name: 'Meera', username: 'meera.reads' },
  { name: 'Kabir', username: 'kabir.lifts' },
]

const STEPS = [
  { icon: Flag, title: 'Pick a challenge', text: 'Open Winter Arc 90, or any public challenge.' },
  { icon: UsersRound, title: 'Create your group', text: 'Name it. You become the organizer, with room for 2 to 10 members.' },
  { icon: UserPlus, title: 'Add your friends', text: 'Enter each member’s name and Arcloop username.', members: true },
  { icon: MailCheck, title: 'Everyone accepts', text: 'Each member gets an invite, and nothing is shared until they accept.' },
  { icon: Rocket, title: 'Start together', text: 'The group challenge begins. Everyone checks in for themselves; the group score is the average.' },
]

const STEP_SECONDS = 2.2

// Each step lights up in turn, so the plan reads as a sequence.
const activeCircle = keyframes`
  0%, 16% { background-color: ${colors.mint300}; color: ${colors.navy900}; box-shadow: 0 0 0 6px rgba(124, 240, 192, 0.28); transform: scale(1.08); }
  22%, 100% { background-color: rgba(255, 255, 255, 0.16); color: ${colors.textOnDark}; box-shadow: 0 0 0 0 rgba(124, 240, 192, 0); transform: none; }
`
const activeText = keyframes`
  0%, 16% { opacity: 1; }
  22%, 100% { opacity: 0.72; }
`

// The plan for joining a challenge as a group, as an animated timeline. The member names are sample data.
export default function GroupPlan() {
  const { t } = useI18n()
  const [ref, play] = useInView({ threshold: 0.25 })
  const cycle = STEPS.length * STEP_SECONDS
  return (
    <Box
      ref={ref}
      sx={{
        p: { xs: 2.5, md: 3.5 },
        borderRadius: `${radii.lg}px`,
        bgcolor: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 24px 60px rgba(6, 18, 43, 0.35)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        <Typography variant="h4" component="h3">
          {t('Your plan to join as a group')}
        </Typography>
        <DemoBadge onDark label="Sample members" />
      </Box>
      <Box component="ol" aria-label={t('Steps')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {STEPS.map(({ icon: Icon, title, text, members }, i) => (
        <Box component="li" key={title} sx={{ display: 'flex', gap: 2, position: 'relative', pb: i === STEPS.length - 1 ? 0 : 2.5 }}>
          {i < STEPS.length - 1 && <Box aria-hidden="true" sx={{ position: 'absolute', left: 21, top: 44, bottom: 0, width: 2, borderRadius: 1, background: 'linear-gradient(rgba(124, 240, 192, 0.7), rgba(255, 255, 255, 0.14))' }} />}
          <Box
            aria-hidden="true"
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(255, 255, 255, 0.16)',
              color: colors.textOnDark,
              animation: play ? `${activeCircle} ${cycle}s ease-in-out ${i * STEP_SECONDS}s infinite` : 'none',
              ...noMotion,
            }}
          >
            <Icon size={20} />
          </Box>
          <Box sx={{ minWidth: 0, pt: 0.25, animation: play ? `${activeText} ${cycle}s ease-in-out ${i * STEP_SECONDS}s infinite` : 'none', ...noMotion }}>
            <Typography sx={{ fontWeight: 800 }}>
              <Box component="span" sx={{ color: colors.mint300, mr: 1 }}>
                {i + 1}.
              </Box>
              {t(title)}
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textOnDarkMuted, mt: 0.25 }}>
              {t(text)}
            </Typography>
            {members && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.25 }}>
                {SAMPLE_MEMBERS.map((m, k) => (
                  <Box
                    key={m.username}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      pl: 0.5,
                      pr: 1.25,
                      py: 0.5,
                      borderRadius: '999px',
                      bgcolor: 'rgba(255, 255, 255, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.24)',
                      opacity: play ? 1 : 0,
                      animation: play ? `${popIn} 500ms ease ${600 + k * 220}ms both` : 'none',
                      ...noMotion,
                    }}
                  >
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: colors.mint300, color: colors.navy900, fontWeight: 800, fontSize: '0.75rem' }}>
                      {m.name[0]}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: colors.textOnDark }}>
                      {m.name} <Box component="span" sx={{ color: colors.textOnDarkMuted, fontWeight: 400 }}>@{m.username}</Box>
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      ))}
      </Box>
    </Box>
  )
}
