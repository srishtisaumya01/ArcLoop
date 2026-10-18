import { Box, Card, CardContent, Typography } from '@mui/material'
import { Check, User, UserPlus, Users } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { JOIN_RULES } from '../../constants/communityDemo.js'
import { colors, gradients } from '../../theme/tokens.js'

const ICONS = { individual: User, friend: UserPlus, group: Users }

// Rules for each way of joining: solo, as a friend invited into a group, or as the group that creates it.
export default function JoinRules() {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
      {JOIN_RULES.map((r, i) => {
        const Icon = ICONS[r.key]
        return (
          <Reveal as="li" key={r.key} delay={i * 130}>
            <Card sx={{ height: '100%', '&:hover': { transform: 'translateY(-4px)' } }}>
              <Box aria-hidden="true" sx={{ height: 6, background: gradients.brand }} />
              <CardContent sx={{ p: 3.5 }}>
                <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, mb: 2 }}>
                  <Icon size={24} aria-hidden="true" />
                </Box>
                <Typography variant="h3" component="h3" sx={{ mb: 0.5 }}>
                  {r.title}
                </Typography>
                <Typography sx={{ color: colors.blue600, fontWeight: 600, mb: 2.5 }}>{r.subtitle}</Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
                  {r.rules.map((rule) => (
                    <Box component="li" key={rule} sx={{ display: 'flex', gap: 1.25 }}>
                      <Box sx={{ mt: '3px', color: colors.success, flexShrink: 0 }}>
                        <Check size={18} aria-hidden="true" />
                      </Box>
                      <Typography color="text.secondary">{rule}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Reveal>
        )
      })}
    </Box>
  )
}
